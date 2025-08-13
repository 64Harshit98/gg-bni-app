import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';

interface IFloatingButtonProps {
  className?: string;
  children?: ReactNode;
}

const FloatingButton: React.FC<IFloatingButtonProps> = ({
  className,
  children,
}) => {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'fixed bottom-20 right-4 z-5000 bg-black text-white p-5 w-4 h-4 rounded-full flex items-center justify-center',
          className,
        )}
      >
        +
      </PopoverTrigger>
      {children && (
        <PopoverContent
          align="center"
          side="top"
          className="bg-transparent p-4 border-none shadow-none"
        >
          {children}
        </PopoverContent>
      )}
    </Popover>
  );
};

export { FloatingButton };
