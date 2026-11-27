import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  className?: string;
  /** Optional route to go to; defaults to browser history back. */
  to?: string;
  onClick?: () => void;
  /** Esc presses this button (default on). Turn off on a page that uses Esc for something else. */
  escToGoBack?: boolean;
}

// Back buttons currently on screen, in mount order. Esc only presses the last
// visible one, so a page with a phone + desktop back button goes back once.
const mounted: HTMLButtonElement[] = [];

const isVisible = (el: Element): boolean => {
  if (el.getClientRects().length === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.opacity !== '0' && s.pointerEvents !== 'none';
};

// Modals, sheets, drawers and popups: while one is open, Esc belongs to it.
const OVERLAY_SELECTOR = '[role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"], .fixed.inset-0';

const isEditable = (el: Element | null): boolean =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

const BackButton = ({ className = '', to, onClick, escToGoBack = true }: BackButtonProps) => {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  // Latest click handler for the Esc listener (props can change between renders)
  const clickRef = useRef(handleClick);
  clickRef.current = handleClick;

  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn || !escToGoBack) return;
    mounted.push(btn);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

      // Only the topmost visible back button reacts
      const visible = mounted.filter(isVisible);
      if (visible[visible.length - 1] !== btn) return;

      // A modal / sheet / menu is open (and isn't the screen this button lives in): Esc closes that instead
      // (lib/escToClose.ts presses its close button)
      const overlayOpen = Array.from(document.querySelectorAll(OVERLAY_SELECTOR))
        .some(el => !el.contains(btn) && isVisible(el));
      if (overlayOpen) return;

      // Typing in a field: the first Esc only leaves the field (and closes its dropdown)
      const active = document.activeElement;
      if (isEditable(active)) {
        setTimeout(() => { if (!e.defaultPrevented) (active as HTMLElement).blur(); }, 0);
        return;
      }

      // Run after every other Esc handler, so one that already used Esc (preventDefault) wins
      setTimeout(() => {
        if (e.defaultPrevented || !btn.isConnected) return;
        clickRef.current();
      }, 0);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const i = mounted.indexOf(btn);
      if (i >= 0) mounted.splice(i, 1);
    };
  }, [escToGoBack]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      title="Back (Esc)"
      aria-label="Back"
      aria-keyshortcuts="Escape"
      className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm text-slate-700 transition-colors hover:bg-slate-200 ${className}`}
    >
      <ArrowLeft size={22} strokeWidth={2.5} />
    </button>
  );
};

export default BackButton;
