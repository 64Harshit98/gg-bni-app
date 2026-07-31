import { useEffect, useState } from 'react';

/**
 * Debounces a rapidly-changing value, only updating the returned value once
 * `delayMs` has elapsed without a further change. Useful for search inputs
 * and filter fields that would otherwise trigger an expensive lookup (API
 * call, large-list filter) on every keystroke.
 *
 * A grep across `src/Pages/hooks` and `src/Catalogue/hooks` found no
 * existing `useDebounce` implementation, so this is a fresh implementation
 * establishing `src/hooks` as the canonical location going forward.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}
