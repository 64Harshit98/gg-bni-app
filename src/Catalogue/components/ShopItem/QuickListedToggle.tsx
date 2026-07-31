import React, { useState } from 'react';
import { CheckSquare, Star } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Spinner as ModernSpinner } from '../../../Components/ui/spinner';

export interface QuickListedToggleProps {
  itemId: string;
  isListed: boolean;
  onToggle: (itemId: string, newState: boolean) => Promise<void>;
  disabled?: boolean;
}

/** Small pill button to flip an item's `isListed` state directly from the product grid. */
export function QuickListedToggle({ itemId, isListed, onToggle, disabled }: QuickListedToggleProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isLoading) return;
    setIsLoading(true);
    try {
      await onToggle(itemId, !isListed);
    } catch (error) {
      console.error('Error toggling listed status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={cn(
        'flex-1 py-1.5 rounded-md text-[9px] font-black uppercase cursor-pointer tracking-wider transition-all flex items-center justify-center gap-1',
        isListed ? 'bg-success text-success-foreground shadow-sm' : 'bg-muted text-muted-foreground',
      )}
    >
      {isLoading ? (
        <ModernSpinner size="sm" className="size-[10px]" />
      ) : isListed ? (
        <CheckSquare size={10} />
      ) : (
        <Star size={10} />
      )}
      Live
    </button>
  );
}
