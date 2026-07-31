import React from 'react';

interface SettingsCardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/** Rounded, bordered card used to group a section of related settings fields. */
export const SettingsCard: React.FC<SettingsCardProps> = ({ title, icon, children, action }) => (
  <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm md:p-6">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <h2 className="text-base font-semibold text-foreground md:text-lg">{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </section>
);
