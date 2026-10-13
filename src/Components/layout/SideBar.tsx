import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

import ShowWrapper from '../../context/ShowWrapper';
import type { Permissions } from '../../enums';
import type { Cata_Permissions } from '../../Catalogue/enum/cata_permissions.enum';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import { Avatar, UserMenu, THEMES, type Theme } from './UserMenu';

type AnyPermission = Permissions | Cata_Permissions;

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

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
  switcher?: ReactNode; // POS / Catalogue switcher (with tutorial wrapper)
  theme?: Theme; // 'sky' (POS) | 'orange' (Catalogue)
}

const COLLAPSE_KEY = 'gg-sidebar-collapsed';

export function Sidebar({ navItems, quickActions, userName, userRole, switcher, theme = 'sky' }: SidebarProps) {
  const t = THEMES[theme];
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
      className={cx(
        'hidden md:flex flex-col h-full flex-shrink-0 z-20 transition-[width] duration-200 ease-out',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      {/* NOTE: no overflow-hidden here, so the tutorial tooltip is never clipped */}
      <div className="relative m-3 flex h-[calc(100%-1.5rem)] flex-col rounded-sm border border-slate-200/80 bg-white/80 shadow-xl shadow-black/5 backdrop-blur-md">
        {/* Brand */}
        <div
          className={cx(
            'flex items-center gap-2 border-b border-slate-200/70 py-4',
            collapsed ? 'justify-center px-2' : 'px-4',
          )}
        >
          {!collapsed && <img src={sellarLogo} alt="Sellar" className="h-7 w-auto" />}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cx(
              'flex size-7 shrink-0 items-center justify-center rounded-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900',
              !collapsed && 'ml-auto',
            )}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>

        {/* POS / Catalogue switcher */}
        {switcher && !collapsed && <div className="px-3 pt-3">{switcher}</div>}

        {/* Primary nav */}
        <nav className={cx('flex-1 space-y-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
          {navItems.map(({ to, icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center rounded-sm py-2.5 text-sm font-medium transition-all',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                  isActive
                    ? t.navActive
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('relative shrink-0 [&>svg]:size-[18px]', isActive && 'text-white')}>
                    {icon}
                    {collapsed && !!badge && (
                      <span className="absolute -right-1.5 -top-1 size-2 rounded-sm bg-red-500 ring-2 ring-white" />
                    )}
                  </span>
                  {!collapsed && <span className="truncate">{label}</span>}
                  {!collapsed && !!badge && (
                    <span
                      className={cx(
                        'ml-auto flex min-w-[18px] items-center justify-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold',
                        isActive ? 'bg-white/25 text-white' : 'bg-red-500 text-white',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}

          {!collapsed ? (
            <p className="px-3 pb-1.5 pt-5 text-xs font-semibold text-slate-400">Quick actions</p>
          ) : (
            <div className="mx-1 my-4 border-t border-slate-200/70" />
          )}

          {quickActions.map((action) => {
            const rowBase = 'group flex items-center rounded-sm border py-2 text-sm transition-all';
            const paddingCls = collapsed ? 'justify-center px-0' : 'gap-3 px-3';
            const iconBase = 'flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors';
            const idleIcon = t.qaIconIdle;

            const node = action.to ? (
              <NavLink
                key={action.key}
                to={action.to}
                end
                title={collapsed ? action.label : undefined}
                className={({ isActive }) =>
                  cx(
                    rowBase,
                    paddingCls,
                    isActive
                      ? t.qaActive
                      : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx(iconBase, isActive ? t.qaIconActive : idleIcon)}>
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
                className={cx(
                  'w-full border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900',
                  rowBase,
                  paddingCls,
                )}
              >
                <span className={cx(iconBase, idleIcon)}>{action.icon}</span>
                {!collapsed && <span className="truncate">{action.label}</span>}
              </button>
            );

            return action.permission ? (
              <ShowWrapper key={action.key} requiredPermission={action.permission as any}>
                {node}
              </ShowWrapper>
            ) : (
              node
            );
          })}
        </nav>

        {/* Footer: user */}
        <div className="border-t border-slate-200/70 p-3">
          <UserMenu
            userName={userName}
            placement="top-left"
            buttonClassName={cx(
              'flex w-full items-center rounded-sm p-2 text-left transition-colors hover:bg-slate-100',
              collapsed ? 'justify-center' : 'gap-2.5',
            )}
          >
            <Avatar name={userName} theme={theme} />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{userName || 'Account'}</span>
                {userRole && <span className="block truncate text-xs text-slate-500">{userRole}</span>}
              </span>
            )}
          </UserMenu>
        </div>
      </div>
    </aside>
  );
}