import React from 'react';
import { btnClass } from './StoreUI';

interface StorefrontErrorProps {
  onRetry?: () => void;
}

// Survives the unmount while the retry shows the page's loader, which would
// reset component state and make the full reload below unreachable.
let retriedInPlace = false;

// Terminal state for a failed public storefront load. Every load path ends
// here or in the real page — never in an endless spinner or a blank screen.
// "Try again" re-runs the data load in place first; if that fails too, the
// second press does a full reload (fresh HTML + JS) as the last resort.
const StorefrontError: React.FC<StorefrontErrorProps> = ({ onRetry }) => {
  const handleRetry = () => {
    if (!retriedInPlace && onRetry) {
      retriedInPlace = true;
      onRetry();
      return;
    }
    window.location.reload();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 bg-sf-canvas px-6 text-center">
      <h2 className="text-xl font-semibold text-slate-900">We couldn't open this store</h2>
      <p className="max-w-[40ch] text-sm text-slate-600">Check your internet connection and try again.</p>
      <button type="button" onClick={handleRetry} className={`${btnClass('primary')} mt-4`}>
        Try again
      </button>
    </div>
  );
};

export default StorefrontError;
