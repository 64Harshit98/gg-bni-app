import * as React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'outline' | 'filled';
}

const CustomButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => {
    const variantClasses = {
      outline:
        'bg-white text-black border border-black hover:bg-gray-100 border-2',
      filled: 'bg-black text-white hover:bg-gray-800',
    };

    return (
      <Button
        className={cn(
          'py-6 font-bold rounded-xs',
          variantClasses[variant],
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
