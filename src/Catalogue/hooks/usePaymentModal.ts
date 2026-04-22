import { useState } from 'react';

export interface UsePaymentModalReturn<T> {
  isOpen: boolean;
  selectedItem: T | null;
  open: (item: T) => void;
  close: () => void;
}

/**
 * Controls the PaymentModal open/close state and which record
 * is currently selected. Generic over the record type (Invoice | Order).
 *
 * Usage:
 * ```tsx
 * const pm = usePaymentModal<Invoice>();
 * <button onClick={() => pm.open(invoice)}>Settle</button>
 * <PaymentModal isOpen={pm.isOpen} invoice={pm.selectedItem} onClose={pm.close} />
 * ```
 */
export const usePaymentModal = <T>(): UsePaymentModalReturn<T> => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const open = (item: T) => {
    setSelectedItem(item);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    // keep selectedItem alive briefly so the modal can animate out
    setTimeout(() => setSelectedItem(null), 300);
  };

  return { isOpen, selectedItem, open, close };
};
