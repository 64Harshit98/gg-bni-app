import * as React from 'react';
import { cn } from '../../../lib/utils';
import { InfoTooltip } from '../../../Components/InfoToolTip';

export interface SettingsToggleRowProps {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Shared toggle-switch row used across the Settings pages (Item, Purchase,
 * Bill settings) for a single boolean preference. Replaces the
 * near-identical hand-rolled `ToggleRow`/checkbox-switch markup that used
 * to be duplicated in each settings file.
 */
export const SettingsToggleRow: React.FC<SettingsToggleRowProps> = ({
  id,
  label,
  description,
  tooltip,
  checked,
  onChange,
  disabled,
}) => (
  <div
    className={cn(
      'flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/40 p-3.5 transition-colors md:p-4',
      !disabled && 'hover:border-primary/30',
      disabled && 'opacity-60',
    )}
  >
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className={cn('text-sm font-semibold text-foreground leading-5', !disabled && 'cursor-pointer')}>
          {label}
        </label>
        {tooltip ? <InfoTooltip text={tooltip} /> : null}
      </div>
      {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
    </div>
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
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
  </div>
);
