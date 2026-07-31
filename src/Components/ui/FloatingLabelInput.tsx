import React from 'react';
import { AlertCircle, Check } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Input } from './input';

interface FloatingLabelInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  onFill?: () => void;
  showFillButton?: boolean;
  icon?: React.ReactNode;
  /** Error message — shows a red ring, alert icon and inline text. */
  error?: string | null;
  /** Marks the field valid — shows a green ring and check icon. */
  success?: boolean;
}

const FloatingLabelInput = React.forwardRef<
  HTMLInputElement,
  FloatingLabelInputProps
>(
  (
    { className, label, id, onFill, showFillButton, icon, error, success, ...props },
    ref,
  ) => {
    const inputId = id || label.replace(/\s+/g, '-').toLowerCase();
    const hasError = Boolean(error);
    const isValid = Boolean(success) && !hasError;
    const showStatus = hasError || isValid;

    return (
      <div>
        <div className="relative">
          {icon && (
            <div className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              {icon}
            </div>
          )}

          <Input
            id={inputId}
            aria-invalid={hasError || undefined}
            className={cn(
              'peer h-12 rounded-lg border bg-background placeholder-transparent transition-[color,box-shadow,border-color] focus-visible:ring-[3px]',
              icon ? 'pl-10' : 'pl-3',
              showStatus || (showFillButton && onFill) ? 'pr-10' : 'pr-3',
              hasError
                ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25'
                : isValid
                  ? 'border-success/70 focus-visible:ring-success/25'
                  : 'border-input',
              className,
            )}
            placeholder=" "
            ref={ref}
            {...props}
          />

          {hasError ? (
            <AlertCircle className="text-destructive pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
          ) : isValid ? (
            <Check className="text-success pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
          ) : null}

          <label
            htmlFor={inputId}
            className={cn(
              'bg-background pointer-events-none absolute -top-2.5 left-3 px-1 text-xs transition-all',
              'peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs',
              icon
                ? 'peer-placeholder-shown:top-3 peer-placeholder-shown:left-10'
                : 'peer-placeholder-shown:top-3 peer-placeholder-shown:left-3',
              hasError
                ? 'text-destructive'
                : isValid
                  ? 'text-success'
                  : 'text-muted-foreground peer-focus:text-primary',
            )}
          >
            {label}
            {props.required && <span className="text-destructive"> *</span>}
          </label>

          {showFillButton && onFill && !showStatus && (
            <button
              type="button"
              onClick={onFill}
              className="bg-primary/10 text-primary absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-semibold transition hover:bg-primary/20"
            >
              Fill
            </button>
          )}
        </div>

        {hasError && (
          <p className="text-destructive animate-in fade-in-0 slide-in-from-top-1 mt-1 flex items-center gap-1 text-[11px]">
            <AlertCircle className="size-3 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  },
);

FloatingLabelInput.displayName = 'FloatingLabelInput';

export { FloatingLabelInput };
