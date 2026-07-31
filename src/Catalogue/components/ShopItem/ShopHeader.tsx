import { ArrowLeft } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface ShopHeaderProps {
  companyName: string;
  categoryName: string;
  isScrolled: boolean;
  onBack: () => void;
}

/** Sticky glass header with a crossfade between the company name and the active category name. */
export function ShopHeader({ companyName, categoryName, isScrolled, onBack }: ShopHeaderProps) {
  return (
    <header className="glass sticky top-0 z-[100] w-full">
      <div className="relative mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onBack}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/25 transition-transform active:scale-95"
            title="Back"
          >
            <ArrowLeft className="size-5" />
          </button>

          <span
            className={cn(
              'hidden md:inline-block whitespace-nowrap text-[10px] font-semibold uppercase text-muted-foreground transition-all duration-300 ease-out md:text-xs',
              isScrolled ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0',
            )}
          >
            {companyName}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span
            className={cn(
              'absolute whitespace-nowrap text-lg font-black uppercase tracking-tighter text-foreground transition-all duration-300 ease-out will-change-transform',
              isScrolled ? '-translate-y-6 scale-95 opacity-0' : 'translate-y-0 scale-100 opacity-100',
            )}
          >
            {companyName}
          </span>

          <span
            className={cn(
              'absolute whitespace-nowrap text-lg font-black uppercase tracking-tighter text-gradient transition-all duration-300 ease-out will-change-transform',
              isScrolled ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0',
            )}
          >
            {categoryName}
          </span>

          {isScrolled && (
            <span className="mt-10 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
              {companyName}
            </span>
          )}
        </div>

        <div className="w-10 shrink-0" />
      </div>
    </header>
  );
}
