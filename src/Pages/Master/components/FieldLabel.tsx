import * as React from 'react';
import { cn } from '../../../lib/utils';
import { InfoTooltip } from '../../../Components/InfoToolTip';

interface FieldLabelProps {
  children: React.ReactNode;
  required?: boolean;
  tooltip?: string;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Shared field label + required-asterisk + info tooltip combo used by every
 * input in the Add Item form, so label styling stays perfectly consistent.
 */
export const FieldLabel: React.FC<FieldLabelProps> = ({
  children,
  required,
  tooltip,
  icon,
  className,
}) => (
  <div className="mb-1 flex items-center">
    <label
      className={cn(
        'mr-2 flex items-center gap-1.5 text-sm font-medium leading-none text-foreground',
        required && "after:content-['*'] after:ml-0.5 after:text-destructive",
        className,
      )}
    >
      {icon}
      {children}
    </label>
    {tooltip && <InfoTooltip text={tooltip} />}
  </div>
);
