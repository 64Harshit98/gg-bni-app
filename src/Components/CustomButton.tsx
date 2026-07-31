import * as React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { Variant } from '../enums';
import { useLocation } from 'react-router-dom';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant;
  active?: boolean;
}

const CustomButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, active, ...props }, ref) => {
    const location = useLocation();
    const isCataloguePage = location.pathname.includes('catalogue');
    const baseClasses = 'flex-1 rounded-sm py-3 px-3 text-center text-lg font-bold transition mx-1';

    const variantClasses = {
      [Variant.Outline]:
        'bg-card text-foreground border border-black hover:bg-muted border-2',
      [Variant.Filled]:
        'bg-black text-white border border-black border-2 hover:bg-gray-800',
      [Variant.Transparent]:
        'bg-card text-foreground border border-border hover:bg-gray-800 hover:text-white',
      [Variant.Payment]:
        'bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-lg py-3 px-8 rounded-sm transition-colors',
      [Variant.Save]:
        'bg-sky-500 text-white border border-sky-500 border-2 hover:bg-gray-800 ',
    };

    const activeClasses = {
      [Variant.Transparent]: isCataloguePage
        ? 'bg-[#F97316] text-white font-bold border-[#F97316] hover:bg-[#ea580c] hover:border-[#ea580c]'
        : 'bg-sky-500 text-white font-bold border-sky-500 hover:text-white hover:bg-gray-800 hover:border-gray-800',
      [Variant.Outline]: '',
      [Variant.Filled]: '',
      [Variant.Payment]: '',
      [Variant.Save]: '',
    };

    return (
      <Button
        className={cn(
          baseClasses,
          variantClasses[variant],
          active && activeClasses[variant],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
CustomButton.displayName = 'Button';

export { CustomButton };