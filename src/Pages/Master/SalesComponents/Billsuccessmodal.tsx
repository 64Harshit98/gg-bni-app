import React from 'react';
import QRCode from 'react-qr-code';
import { FiX, FiSend } from 'react-icons/fi';
import { Spinner } from '../../../constants/Spinner';

interface BillSuccessModalProps {
  savedBillData: {
    id: string;
    number: string;
    invoiceData?: any;
  };
  companyId: string | undefined;
  sendingPdf: boolean;
  onClose: () => void;
  onSendWhatsapp: (invoiceData: any) => void;
}

const BillSuccessModal: React.FC<BillSuccessModalProps> = ({
  savedBillData,
  companyId,
  sendingPdf,
  onClose,
  onSendWhatsapp,
}) => {
  const qrValue = `${window.location.origin}/download-bill/${companyId}/${savedBillData.id}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">

          <button
            onClick={onClose}
            className="self-end text-gray-400 hover:text-gray-600 mb-2"
            aria-label="Close"
          >
            <FiX size={24} />
          </button>

          <h3 className="text-xl font-bold text-gray-800 mb-1">Bill Saved!</h3>
          <p className="text-sm text-gray-500 mb-4">Invoice #{savedBillData.number}</p>

          <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
            <QRCode value={qrValue} size={200} viewBox="0 0 256 256" />
          </div>

          <p className="text-center text-sm text-gray-600 mb-4">
            Ask customer to scan this QR code to download their bill.
          </p>

          {savedBillData.invoiceData?.partyNumber ? (
            <button
              onClick={() => onSendWhatsapp(savedBillData.invoiceData)}
              disabled={sendingPdf}
              className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
            >
              {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
            </button>
          ) : (
            <p className="text-xs text-amber-600 mb-3 text-center bg-amber-50 p-2 rounded w-full border border-amber-200">
              No phone number provided for WhatsApp.
            </p>
          )}

          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
      </div>
    </div>
  );
};

export default BillSuccessModal;