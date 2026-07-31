import React from 'react';
import { Undo2 } from 'lucide-react';

/**
 * Glass sticky header for the Purchase Return page. Extracted verbatim
 * (styling reskinned onto design tokens) from `PurchaseReturn.tsx`'s
 * `renderHeader` function.
 */
export const PurchaseReturnHeader: React.FC = () => {
  return (
    <div className="glass sticky top-0 z-[100] mx-2 mt-2 flex flex-shrink-0 items-center gap-3 rounded-2xl p-3 shadow-sm md:mx-3 md:mt-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/25">
        <Undo2 className="size-5" />
      </span>
      <h1 className="text-xl font-bold text-foreground">
        <span className="text-gradient">Purchase Return</span>
      </h1>
    </div>
  );
};
