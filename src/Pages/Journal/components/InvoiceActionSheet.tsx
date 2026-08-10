import React from 'react';
import { FiSend } from 'react-icons/fi';
import { Spinner } from '../../../constants/Spinner';
import { IconClose, IconDownload, IconPrint, IconScanCircle } from '../../../constants/Icons';
import { ACTION } from '../../../enums';
import { Permissions } from '../../../enums/permissions.enum';
import ShowWrapper from '../../../context/ShowWrapper';
import type { Invoice } from '../journal.types';

interface InvoiceActionSheetProps {
  invoiceToPrint: Invoice;
  setInvoiceToPrint: (invoice: Invoice | null) => void;
  setShowPrintSubMenu: (v: boolean) => void;
  isPosBasicPlan: boolean;
  billType: 'estimate' | 'bill';
  setBillType: (v: 'estimate' | 'bill') => void;
  sendingPdf: boolean;
  handleSendWhatsapp: (invoice: Invoice) => void;
  handlePdfAction: (invoice: Invoice, action: ACTION.DOWNLOAD | ACTION.PRINT, withDuplicate?: boolean) => void;
  handleShowQr: (invoice: Invoice) => void;
  handlePrintQr: (invoice: Invoice) => void;
}

// "Select Action" modal (WhatsApp / Download / Print / QR) triggered from a
// selected invoice — moved verbatim from Journal.tsx.
export const InvoiceActionSheet: React.FC<InvoiceActionSheetProps> = ({
  invoiceToPrint,
  setInvoiceToPrint,
  setShowPrintSubMenu,
  isPosBasicPlan,
  billType,
  setBillType,
  sendingPdf,
  handleSendWhatsapp,
  handlePdfAction,
  handleShowQr,
  handlePrintQr,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setInvoiceToPrint(null); setShowPrintSubMenu(false); }}>
      <div className="bg-white rounded-sm p-4 w-full max-w-sm mx-4 shadow-xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Select Action</h3>
          <button onClick={() => { setInvoiceToPrint(null); setShowPrintSubMenu(false); }} className="text-gray-500 hover:text-gray-700">
            <IconClose />
          </button>
        </div>
        {/* Bill type toggle */}
        {!isPosBasicPlan && (
          <div className="flex mb-4 bg-slate-100 rounded-sm p-1">
            {['bill', 'estimate'].map((type) => (
              <button
                key={type}
                onClick={() => setBillType(type as any)}
                className={`flex-1 py-2 text-xs font-bold uppercase rounded-sm transition-all ${billType === type
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500'
                  }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}
        <p className="text-gray-600 mb-6">Choose how you want to provide the bill.</p>

        <div className="flex flex-col gap-3">
          {invoiceToPrint.type === 'Credit' ? (
            <>
              <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                <button
                  onClick={() => handleSendWhatsapp({
                    ...invoiceToPrint,
                    isEstimate: billType === 'estimate'
                  } as any)}
                  disabled={sendingPdf}
                  className="w-full bg-green-600 text-white py-2.5 px-4 rounded-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                </button>
              </ShowWrapper>
              <button
                onClick={() => handlePdfAction({
                  ...invoiceToPrint,
                  isEstimate: billType === 'estimate'
                } as any, ACTION.DOWNLOAD)}
                className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <IconDownload /> Download PDF
              </button>
              {isPosBasicPlan ? (
                <button
                  onClick={() => {
                    const inv = invoiceToPrint;
                    setInvoiceToPrint(null);
                    handlePdfAction(
                      { ...inv, isEstimate: billType === 'estimate' } as any,
                      ACTION.PRINT,
                      false
                    );
                  }}
                  className="w-full bg-white text-gray-700 border border-gray-300 py-2.5 px-4 rounded-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <IconPrint /> Print
                </button>
              ) : (
                <button
                  onClick={() => setShowPrintSubMenu(true)}
                  className="w-full bg-white text-gray-700 border border-gray-300 py-2.5 px-4 rounded-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <IconPrint /> Print
                </button>
              )}
              <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                <button onClick={() => handleShowQr(invoiceToPrint)} className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                  <IconScanCircle width={20} height={20} /> Generate QR Code
                </button>
              </ShowWrapper>
            </>
          ) : (
            <>
              <button onClick={() => handlePdfAction(invoiceToPrint, ACTION.DOWNLOAD)} className="w-full text-white py-2.5 px-4 rounded-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 bg-blue-600" disabled>
                <IconDownload /> Download PDF
              </button>

              <button
                onClick={() => {
                  handlePrintQr(invoiceToPrint);
                  setInvoiceToPrint(null);
                }}
                className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <IconPrint /> Print QR
              </button>

            </>
          )}
        </div>
      </div>
    </div>
  );
};
