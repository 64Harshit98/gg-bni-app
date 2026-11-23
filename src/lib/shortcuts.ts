import { useEffect, useRef } from 'react';

// App-wide keyboard shortcuts. All use Alt + a letter: Ctrl+K is the command
// palette and Ctrl+letter collides with browser shortcuts (Ctrl+S, Ctrl+P…).
export const SHORTCUTS = {
  newSale: { code: 'KeyS', label: 'Alt+S' },
  newPurchase: { code: 'KeyP', label: 'Alt+P' },
  kBill: { code: 'KeyK', label: 'Alt+K' },
} as const;

export type ShortcutCode = (typeof SHORTCUTS)[keyof typeof SHORTCUTS]['code'];

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

const isEditable = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  return !!node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable);
};

/**
 * True for a plain Alt + <code> press. Uses `code` (physical key), so it works
 * on any keyboard layout and on Mac (Option+K types "˚", not "k"). On Mac,
 * Option+letter is also how people type special characters, so a press while
 * typing in a field is left alone there.
 */
export const isAltShortcut = (e: KeyboardEvent, code: ShortcutCode): boolean => {
  if (e.code !== code || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  if (e.repeat || e.isComposing) return false;
  if (IS_MAC && isEditable(e.target)) return false;
  return true;
};

/** Runs `handler` on Alt + <code> while `enabled`. The latest handler is always used. */
export const useAltShortcut = (code: ShortcutCode, handler: () => void, enabled = true) => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isAltShortcut(e, code)) return;
      e.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [code, enabled]);
};
