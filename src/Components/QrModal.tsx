import React from 'react';
import QRCode from 'react-qr-code';
import { FiX } from 'react-icons/fi';

interface QrModalProps {
  /** The value encoded in the QR code. */
  value: string;
  /** Title shown above the QR code (e.g. "Download Bill"). */
  title?: string;
  /** Sub-label (e.g. "Invoice #1234"). */
  subtitle?: string;
  onClose: () => void;
}

/**
 * Full-screen QR code modal used in both Journal and OrdersPage.
 *
 * Usage:
 * ```tsx
 * {qr.qrItem && (
 *   <QrModal
 *     value={`${window.location.origin}/download-bill/${companyId}/${qr.qrItem.id}`}
 *     subtitle={`Invoice #${qr.qrItem.invoiceNumber}`}
 *     onClose={qr.closeQr}
 *   />
 * )}
 * ```
 */
export const QrModal: React.FC<QrModalProps> = ({
  value,
  title = 'Download Bill',
  subtitle,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close QR modal"
        >
          <FiX size={24} />
        </button>

        <h3 className="text-xl font-bold text-gray-800 mb-1">{title}</h3>

        {subtitle && (
          <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
        )}

        <div className="bg-white p-2 border-2 border-gray-100 rounded-sm shadow-inner mb-4">
          <QRCode value={value} size={200} viewBox="0 0 256 256" />
        </div>

        <p className="text-center text-sm text-gray-600 mb-4">Scan to download PDF</p>

        <button
          onClick={onClose}
          className="w-full bg-sky-500 text-white py-3 rounded-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
