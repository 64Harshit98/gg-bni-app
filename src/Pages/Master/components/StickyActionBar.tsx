import * as React from 'react';
import { Spinner } from '../../../constants/Spinner';

interface StickyActionBarProps {
  /** `sidebar` = full-width button pinned to the bottom of the desktop sidebar.
   *  `mobile` = floating pill anchored to the bottom of the viewport. */
  variant: 'sidebar' | 'mobile';
  isSaving: boolean;
  disabled: boolean;
  onClick: () => void;
}

/**
 * The primary "Add Item" call to action. Same handler and disabled logic in
 * both placements — only the chrome differs between desktop sidebar and the
 * mobile fixed footer.
 */
export const StickyActionBar: React.FC<StickyActionBarProps> = ({
  variant,
  isSaving,
  disabled,
  onClick,
}) => {
  if (variant === 'mobile') {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center bg-transparent p-4 pb-20 md:hidden">
        <button
          onClick={onClick}
          disabled={disabled}
          className="bg-gradient-brand pointer-events-auto flex w-48 max-w-sm items-center justify-center gap-2 rounded-xl px-6 py-3 text-lg font-semibold text-white shadow-xl transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Spinner /> : 'Add Item'}
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border pb-10 pt-6">
      <button
        onClick={onClick}
        disabled={disabled}
        className="bg-gradient-brand glow-primary flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-lg font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? <Spinner /> : <>Add Item</>}
      </button>
    </div>
  );
};
