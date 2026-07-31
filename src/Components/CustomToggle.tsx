import React from 'react';

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

const CustomToggle = React.forwardRef<HTMLDivElement, any>(({ children, className, ...props }, ref) => (
    <div
        className={cn(
            'inline-flex h-11 p-1 items-center justify-center rounded-lg bg-muted border border-border shadow-sm',
            className
        )}
        ref={ref}
        {...props}
    >
        {children}
    </div>
));

const CustomToggleItem = React.forwardRef<HTMLButtonElement, any>(({ children, className, ...props }, ref) => (
    <button
        className={cn(
            'flex grow items-center justify-center rounded-sm text-sm font-medium transition-all px-8 py-2',
            'text-foreground',
            'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:border-transparent',
            className
        )}
        ref={ref}
        {...props}
    >
        {children}
    </button>
));

export { CustomToggle, CustomToggleItem };