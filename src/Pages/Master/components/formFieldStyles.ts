import type { WheelEvent } from 'react';

// Shared className tokens for the Add Item form's inputs, kept in one place
// so every section (Basic Info, Pricing, Inventory, Variants) renders fields
// with identical sizing, radius and focus treatment.

export const fieldInputBaseClass =
  'flex h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50';

export const fieldInputClass = `${fieldInputBaseClass} w-full`;

export const fieldHelperClass = 'mt-1 text-[10px] text-muted-foreground';

// Prevents the mouse wheel from silently incrementing/decrementing number inputs.
export const blurOnWheel = (e: WheelEvent<HTMLInputElement>) =>
  (e.target as HTMLInputElement).blur();
