import * as React from 'react';
import { cn } from '../../../lib/utils';

interface FormSectionHeaderProps {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}

/**
 * Consistent section header used across the Add Item form: an icon badge,
 * an uppercase eyebrow, a bold title and an optional helper description.
 */
export const FormSectionHeader: React.FC<FormSectionHeaderProps> = ({
  icon,
  eyebrow,
  title,
  description,
  className,
}) => (
  <div className={cn('mb-5 flex items-start gap-3', className)}>
    <div className="bg-gradient-brand flex size-9 shrink-0 items-center justify-center rounded-xl shadow-xs [&>svg]:size-4.5 [&>svg]:text-white">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {eyebrow}
      </p>
      <h2 className="text-base font-bold leading-tight text-foreground md:text-lg">
        {title}
      </h2>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  </div>
);
