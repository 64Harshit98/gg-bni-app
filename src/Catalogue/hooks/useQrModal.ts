import { useState } from 'react';

export interface UseQrModalReturn<T> {
  qrItem: T | null;
  openQr: (item: T) => void;
  closeQr: () => void;
}

/**
 * Controls visibility and subject of the QR-code modal.
 * Used identically in Journal and OrdersPage.
 *
 * Usage:
 * ```tsx
 * const qr = useQrModal<Invoice>();
 * <button onClick={() => qr.openQr(invoice)}>QR</button>
 * {qr.qrItem && <QrModal item={qr.qrItem} onClose={qr.closeQr} />}
 * ```
 */
export const useQrModal = <T>(): UseQrModalReturn<T> => {
  const [qrItem, setQrItem] = useState<T | null>(null);

  const openQr = (item: T) => setQrItem(item);
  const closeQr = () => setQrItem(null);

  return { qrItem, openQr, closeQr };
};
