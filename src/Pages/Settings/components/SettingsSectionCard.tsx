import * as React from 'react';
import { cn } from '../../../lib/utils';

interface SettingsSectionCardProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Shared "settings section" card used across the Settings pages: an icon
 * badge + title + description on the left, an optional action/badge on the
 * right, and a content area below. Mirrors the card patterns already
 * established in `Pages/Master/ItemGroup.tsx` / `Catalogue/Shop.tsx`.
 */
export const SettingsSectionCard: React.FC<SettingsSectionCardProps> = ({
  icon,
  title,
  description,
  action,
  badge,
  children,
  className,
  contentClassName,
}) => (
  <section
    className={cn(
      'rounded-2xl border border-border bg-card shadow-xs transition-shadow hover:shadow-sm',
      className,
    )}
  >
    <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-info/20 text-primary shadow-inner">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground md:text-base">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge}
        {action}
      </div>
    </div>
    <div className={cn('space-y-4 p-4 md:p-5', contentClassName)}>{children}</div>
  </section>
);
