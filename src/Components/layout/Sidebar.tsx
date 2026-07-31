import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  UserCog,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/Components/ui/avatar';
import { ThemeToggle } from '@/Components/ui/theme-toggle';
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
import type { Cata_Permissions } from '../../Catalogue/enum/cata_permissions.enum';
import { ROUTES } from '../../constants/routes.constants';
import { logoutUser } from '../../lib/AuthOperations';
import sellarLogo from '../../assets/sellar-logo-heading.png';

type AnyPermission = Permissions | Cata_Permissions;

interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}

export interface QuickAction {
  key: string;
  icon: ReactNode;
  label: string;
  permission?: AnyPermission | null;
  to?: string;
  onClick?: () => void;
}

interface SidebarProps {
  navItems: NavItem[];
  quickActions: QuickAction[];
  userName?: string;
  userRole?: string;
}

const COLLAPSE_KEY = 'gg-sidebar-collapsed';

function initials(name?: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

export function Sidebar({ navItems, quickActions, userName, userRole }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-full flex-shrink-0 z-20 transition-[width] duration-200 ease-out',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      <div className="glass relative m-3 flex h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl shadow-xl shadow-black/5">
        {/* Brand */}
        <div
          className={cn(
            'flex items-center gap-2 border-b border-sidebar-border/70 py-4',
            collapsed ? 'justify-center px-2' : 'px-4',
          )}
        >
          {!collapsed && <img src={sellarLogo} alt="Sellar" className="h-7 w-auto" />}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              !collapsed && 'ml-auto',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>

        {/* Primary nav */}
        <nav className={cn('flex-1 overflow-y-auto py-4 space-y-1', collapsed ? 'px-2' : 'px-3')}>
          {navItems.map(({ to, icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end
              title={collapsed ? label : undefined}
              className={({ isActive: active }) =>
                cn(
                  'group relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-all',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                  active
                    ? 'bg-gradient-brand text-white shadow-md shadow-primary/25'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              {({ isActive: active }) => (
                <>
                  <span className={cn('relative shrink-0 [&>svg]:size-[18px]', active ? 'text-white' : '')}>
                    {icon}
                    {collapsed && !!badge && (
                      <span className="absolute -top-1 -right-1.5 size-2 rounded-full bg-destructive ring-2 ring-sidebar" />
                    )}
                  </span>
                  {!collapsed && <span className="truncate">{label}</span>}
                  {!collapsed && !!badge && (
                    <span
                      className={cn(
                        'ml-auto flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                        active ? 'bg-white/25 text-white' : 'bg-destructive text-destructive-foreground',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}

          {!collapsed && (
            <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Quick actions
            </p>
          )}
          {collapsed && <div className="mx-1 my-4 border-t border-sidebar-border/70" />}

          {quickActions.map((action) => {
            const rowBase = 'group flex items-center rounded-xl border py-2 text-sm transition-all';
            const paddingCls = collapsed ? 'justify-center px-0' : 'gap-3 px-3';
            const iconBase = 'flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors';
            const node = action.to ? (
              <NavLink
                key={action.key}
                to={action.to}
                end
                title={collapsed ? action.label : undefined}
                className={({ isActive: active }) =>
                  cn(
                    rowBase,
                    paddingCls,
                    active
                      ? 'border-primary/30 bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )
                }
              >
                {({ isActive: active }) => (
                  <>
                    <span
                      className={cn(
                        iconBase,
                        active
                          ? 'bg-primary/15 text-primary'
                          : 'bg-secondary text-secondary-foreground group-hover:bg-primary/15 group-hover:text-primary',
                      )}
                    >
                      {action.icon}
                    </span>
                    {!collapsed && <span className="truncate">{action.label}</span>}
                  </>
                )}
              </NavLink>
            ) : (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                title={collapsed ? action.label : undefined}
                className={cn(
                  'w-full',
                  rowBase,
                  paddingCls,
                  'border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <span
                  className={cn(
                    iconBase,
                    'bg-secondary text-secondary-foreground group-hover:bg-primary/15 group-hover:text-primary',
                  )}
                >
                  {action.icon}
                </span>
                {!collapsed && <span className="truncate">{action.label}</span>}
              </button>
            );
            return action.permission ? (
              <ShowWrapper key={action.key} requiredPermission={action.permission}>
                {node}
              </ShowWrapper>
            ) : (
              node
            );
          })}
        </nav>

        {/* Footer — user + theme */}
        <div className="border-t border-sidebar-border/70 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent',
                  collapsed ? 'justify-center' : 'gap-2.5',
                )}
              >
                <Avatar className="size-8 ring-2 ring-primary/20">
                  <AvatarFallback className="bg-gradient-brand text-[11px] font-semibold text-white">
                    {initials(userName).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-sidebar-foreground">
                      {userName || 'Account'}
                    </span>
                    {userRole && (
                      <span className="block truncate text-xs text-muted-foreground">{userRole}</span>
                    )}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
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

          {!collapsed && (
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
