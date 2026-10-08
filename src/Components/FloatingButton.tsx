import type { ReactNode } from 'react';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { useLocation } from 'react-router-dom';

interface IFloatingButtonProps {
  className?: string;
  children?: ReactNode;
}

const FloatingButton: React.FC<IFloatingButtonProps> = ({
  className,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const pathname = location.pathname.toLowerCase();

  const catalogueRoutes = [
    '/catalogue',
    '/order-details',
    '/accounts',
  ];

  const isCatalogue = catalogueRoutes.some((route) =>
    pathname.startsWith(route)
  );

  const bgClass = isCatalogue ? 'bg-[#F97316] hover:bg-orange-600' : 'bg-sky-500 hover:bg-sky-600';

  // Fixed square side length for each menu button, and how many squares sit
  // in one grid row.
  const SQUARE_SIZE = 66;
  const COLUMNS = 3;

  // Pops the (already-permission-filtered) rendered buttons in with a small
  // staggered scale/fade. Layout itself is plain CSS grid (see the container
  // below), which packs exactly COLUMNS squares per row and wraps the rest
  // to the next row — overlap-free by construction no matter how many
  // actions a given role has. Callers provide the icon + label markup inside
  // each button; this just enforces the square card shape/spacing.
  //
  // This runs from a callback ref rather than a `useLayoutEffect` keyed on
  // `isOpen`: Radix's PopoverContent mounts its DOM one render tick after the
  // `open` prop flips, so an effect keyed on `isOpen` fires while the node is
  // still null. A callback ref fires exactly when the node is created,
  // regardless of which commit that happens in.
  const animateMenuItems = (container: HTMLDivElement) => {
    const items = Array.from(container.children) as HTMLElement[];
    if (items.length === 0) return;

    // Phase 1: start every button hidden/shrunk, no transition, so the
    // pop-in animation below has a consistent starting point.
    items.forEach((item) => {
      item.style.width = `${SQUARE_SIZE}px`;
      item.style.height = `${SQUARE_SIZE}px`;
      item.style.margin = '0';
      item.style.padding = '6px';
      item.style.flexDirection = 'column';
      item.style.gap = '4px';
      item.style.whiteSpace = 'normal';
      item.style.textAlign = 'center';
      item.style.overflow = 'hidden';
      item.style.transition = 'none';
      item.style.opacity = '0';
      item.style.transform = 'scale(0.5)';
    });

    // Force layout so the collapsed state above is actually applied before
    // the transition below kicks in.
    void container.offsetHeight;

    requestAnimationFrame(() => {
      items.forEach((item, i) => {
        item.style.transition = `transform 200ms ease ${i * 25}ms, opacity 160ms ease ${i * 25}ms`;
        item.style.transform = 'scale(1)';
        item.style.opacity = '1';
      });
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {isOpen && createPortal(
        <div
          // Below the bottom nav's z-40 (and the FAB trigger inside it) so
          // the nav stays crisp/on top of the blur instead of being sampled
          // by it — only the ordinary page content behind it blurs.
          className="fixed inset-0 z-30 bg-black/10 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />,
        document.body,
      )}
      <PopoverTrigger
        className={cn(
          `fixed bottom-18 right-4 z-30 text-white p-1 w-11 h-11 rounded-full flex items-center justify-center ${bgClass}`,
          className,
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className={cn('transition-transform duration-200 ease-in-out', isOpen && 'rotate-45')}
          style={{ width: '4rem', height: '4rem' }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </PopoverTrigger>
      {children && (
        <PopoverContent
          align="center"
          side="top"
          sideOffset={10}
          collisionPadding={8}
          className="w-auto z-50 bg-slate-50 rounded-sm border border-gray-100 shadow-xl p-2 data-[state=open]:animate-none data-[state=closed]:animate-none"
        >
          <p className="text-center font-semibold text-gray-800 mb-3">Add</p>
          <div
            ref={(node) => { if (node) animateMenuItems(node); }}
            onClick={() => setIsOpen(false)}
            className="grid gap-2 justify-center"
            style={{ gridTemplateColumns: `repeat(${COLUMNS}, ${SQUARE_SIZE}px)` }}
          >
            {children}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
};

export { FloatingButton };
