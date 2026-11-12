import React from 'react';
import QRCode from 'react-qr-code';
import { FiX } from 'react-icons/fi';
import type { Order } from '../orders.types';

interface QrCodeModalProps {
    showQrModal: Order;
    setShowQrModal: (order: Order | null) => void;
    companyId: string | undefined;
}

// QR-code "download bill" modal — moved verbatim from Orders.tsx.
export const QrCodeModal: React.FC<QrCodeModalProps> = ({
    showQrModal,
    setShowQrModal,
    companyId,
}) => {
    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
                <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <FiX size={24} />
                </button>
                <h3 className="text-xl font-bold text-gray-800 mb-1">Download Bill</h3>
                <p className="text-sm text-gray-500 mb-4">Invoice #{showQrModal.orderId}</p>
                <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
                    <QRCode
                        value={`${window.location.origin}/download-bill/${companyId}/${showQrModal.id}`}
                        size={200}
                        viewBox={`0 0 256 256`}
                    />
                </div>
                <p className="text-center text-sm text-gray-600 mb-4">Scan to download PDF</p>
                <button
                    onClick={() => setShowQrModal(null)}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                    Close
                </button>
            </div>
        </div>
    );
};
