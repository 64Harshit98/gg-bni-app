import * as React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../Components/ui/table';
import type { Permissions } from '../../../enums';

interface PermissionGroupTableProps {
  title: string;
  icon?: React.ReactNode;
  permissions: Permissions[];
  descriptions: Partial<Record<Permissions, string>>;
  selectedPermissions: Permissions[];
  isLocked: (permission: Permissions) => boolean;
  onToggle: (permission: Permissions, checked: boolean) => void;
}

/**
 * One permission-group card, rendered as a table: Permission | Description
 * | Access. Used for both the named groups (Dashboard, Sales, ...) and the
 * catch-all "Other" group on the Manage Permissions page.
 */
export const PermissionGroupTable: React.FC<PermissionGroupTableProps> = ({
  title,
  icon,
  permissions,
  descriptions,
  selectedPermissions,
  isLocked,
  onToggle,
}) => (
  <section className="rounded-2xl border border-border bg-card shadow-xs">
    <div className="flex items-center gap-3 border-b border-border p-4">
      {icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-info/20 text-primary shadow-inner">
          {icon}
        </span>
      ) : null}
      <h3 className="text-sm font-bold text-foreground md:text-base">{title}</h3>
    </div>
    <Table containerClassName="rounded-none border-none">
      <TableHeader>
        <TableRow>
          <TableHead>Permission</TableHead>
          <TableHead className="hidden md:table-cell">Description</TableHead>
          <TableHead className="text-right">Access</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {permissions.map((permission) => {
          const locked = isLocked(permission);
          const checked = selectedPermissions.includes(permission);
          const description = descriptions[permission];
          return (
            <TableRow key={permission} className={cn(locked && 'opacity-60')}>
              <TableCell className="whitespace-normal font-medium text-foreground">
                <div className="flex items-center gap-2">
                  <span>{permission}</span>
                  {locked ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground dark:text-warning">
                      <Lock className="size-3" />
                      Upgrade Required
                    </span>
                  ) : null}
                </div>
                {description ? (
                  <p className="mt-0.5 text-xs font-normal text-muted-foreground md:hidden">{description}</p>
                ) : null}
              </TableCell>
              <TableCell className="hidden max-w-md whitespace-normal text-xs text-muted-foreground md:table-cell">
                {description}
              </TableCell>
              <TableCell className="text-right">
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={`Toggle ${permission}`}
                  disabled={locked}
                  title={locked ? 'Upgrade to Pro/Enterprise to unlock' : undefined}
                  onClick={() => onToggle(permission, !checked)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed',
                    checked ? 'bg-primary' : 'bg-muted',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none inline-block size-5 translate-x-0 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out',
                      checked && 'translate-x-5',
                    )}
                  />
                </button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </section>
);
