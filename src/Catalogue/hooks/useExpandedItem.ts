import { useState } from 'react';

export interface UseExpandedItemReturn {
  expandedId: string | null;
  toggle: (id: string) => void;
  close: () => void;
  isExpanded: (id: string) => boolean;
}

/**
 * Accordion-style expand/collapse for a single item at a time.
 * Used by Journal (invoice cards) and OrdersPage (order cards).
 *
 * Usage:
 * ```tsx
 * const { toggle, isExpanded } = useExpandedItem();
 * <Card onClick={() => toggle(item.id)}>
 *   {isExpanded(item.id) && <Details />}
 * </Card>
 * ```
 */
export const useExpandedItem = (): UseExpandedItemReturn => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const close = () => setExpandedId(null);

  const isExpanded = (id: string) => expandedId === id;

  return { expandedId, toggle, close, isExpanded };
};
