import React from 'react';

import { InfoTooltip } from '../../../Components/InfoToolTip';
import { cn } from '../../../lib/utils';

export interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltip?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

/** Labeled switch row used for boolean settings, with an optional info tooltip. */
export const ToggleRow: React.FC<ToggleRowProps> = ({
  id,
  label,
  description,
  checked,
  onChange,
  tooltip,
  disabled = false,
  icon,
}) => (
  <div
    className={cn(
      'flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/40 p-3.5 transition-colors md:p-4',
      disabled && 'pointer-events-none opacity-50',
    )}
  >
    <div className="flex min-w-0 gap-3">
      {icon && <span className="mt-0.5 shrink-0 text-primary">{icon}</span>}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="text-sm font-semibold leading-5 text-foreground">
            {label}
          </label>
          <InfoTooltip text={tooltip || description} />
        </div>
        <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground md:block">{description}</p>
      </div>
    </div>
    <label htmlFor={id} className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="h-6 w-11 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary" />
      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform peer-checked:translate-x-5" />
    </label>
  </div>
);
