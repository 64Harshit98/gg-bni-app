import React from 'react';
import { cn } from '../lib/utils';
import { CardVariant } from '../enums';

interface CustomCardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: CardVariant;
    active?: boolean;
    title?: string;
    value?: string | number;
    titleClassName?: string; 
    valueClassName?: string;
}

const CustomCard = React.forwardRef<HTMLDivElement, CustomCardProps>(
    ({ 
        children, 
        className, 
        variant = CardVariant.Default, 
        active, 
        title, 
        value, 
        titleClassName, 
        valueClassName, 
        ...props 
    }, ref) => {
        
        const baseClasses = 'flex flex-col bg-white transition-all duration-200';

        const variantClasses = {
            [CardVariant.Default]: 
                'mb-2 rounded-sm border border-slate-200 p-6 shadow-sm',
            
            [CardVariant.Summary]: 
                'p-4 rounded-lg shadow-md text-center items-center justify-center min-h-[100px]',
            
            [CardVariant.Outline]: 
                'rounded-sm border-2 border-dashed border-slate-300 p-6 hover:border-slate-400',
        };

        const activeClasses = {
            [CardVariant.Default]: 'border-sky-500 ring-1 ring-sky-500',
            [CardVariant.Summary]: 'ring-2 ring-sky-500 transform scale-105',
            [CardVariant.Outline]: 'border-sky-500 bg-sky-50',
        };

        // Helper to render content based on variant
        const renderContent = () => {
            if (variant === CardVariant.Summary && (title || value)) {
                return (
                    <>
                        <h3 className={cn("text-sm font-medium text-gray-500 uppercase tracking-wider", titleClassName)}>
                            {title}
                        </h3>
                        <p className={cn("text-2xl font-bold text-gray-900 mt-1", valueClassName)}>
                            {value}
                        </p>
                        {children}
                    </>
                );
            }
            return children;
        };

        return (
            <div
                ref={ref}
                className={cn(
                    baseClasses,
                    variantClasses[variant],
                    active && activeClasses[variant],
                    className
                )}
                {...props}
            >
                {renderContent()}
            </div>
        );
    },
);

CustomCard.displayName = 'CustomCard';

export { CustomCard };