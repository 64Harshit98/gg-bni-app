import React from 'react';
import QRCode from 'react-qr-code';
import { X, Download, Printer, ScanLine, Send } from 'lucide-react';
import { ACTION } from '../../enums';
import { Permissions } from '../../enums/permissions.enum';
import ShowWrapper from '../../context/ShowWrapper';
import { Spinner } from '../../constants/Spinner';
import type { Invoice } from '../../services/journal.service';

export type BillType = 'estimate' | 'bill';

export interface InvoiceActionModalsProps {
  invoiceToPrint: Invoice | null;
  setInvoiceToPrint: (invoice: Invoice | null) => void;
  showPrintSubMenu: boolean;
  setShowPrintSubMenu: (show: boolean) => void;
  isPosBasicPlan: boolean;
  billType: BillType;
  setBillType: (type: BillType) => void;
  sendingPdf: boolean;
  enableTriplicate: boolean;
  companyId?: string;
  showQrModal: Invoice | null;
  setShowQrModal: (invoice: Invoice | null) => void;
  handleSendWhatsapp: (invoice: Invoice) => void;
  handlePdfAction: (invoice: Invoice, action: ACTION.DOWNLOAD | ACTION.PRINT, withDuplicate?: boolean) => void;
  handleShowQr: (invoice: Invoice) => void;
  handlePrintQr: (invoice: Invoice) => void;
}

/**
 * The three modals used to pick a print/share action for an invoice: the
 * action selection sheet, the (bill-only vs. bill+duplicate) print submenu,
 * and the "scan to download" QR modal. Extracted from `Journal.tsx` since
 * these three self-contained overlays made up a large, clearly separable
 * chunk of that page.
 */
export const InvoiceActionModals: React.FC<InvoiceActionModalsProps> = ({
  invoiceToPrint,
  setInvoiceToPrint,
  showPrintSubMenu,
  setShowPrintSubMenu,
  isPosBasicPlan,
  billType,
  setBillType,
  sendingPdf,
  enableTriplicate,
  companyId,
  showQrModal,
  setShowQrModal,
  handleSendWhatsapp,
  handlePdfAction,
  handleShowQr,
  handlePrintQr,
}) => {
  return (
    <>
      {/* ACTION SELECTION MODAL */}
      {invoiceToPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setInvoiceToPrint(null); setShowPrintSubMenu(false); }}>
          <div className="bg-card rounded-2xl p-4 w-full max-w-sm mx-4 shadow-xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-foreground">Select Action</h3>
              <button onClick={() => { setInvoiceToPrint(null); setShowPrintSubMenu(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            {/* Bill type toggle */}
            {!isPosBasicPlan && (
              <div className="flex mb-4 bg-muted rounded-lg p-1">
                {(['bill', 'estimate'] as BillType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setBillType(type)}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all ${billType === type
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground'
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
            <p className="text-muted-foreground mb-6">Choose how you want to provide the bill.</p>

            <div className="flex flex-col gap-3">
              {invoiceToPrint.type === 'Credit' ? (
                <>
                  <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                    <button
                      onClick={() => handleSendWhatsapp({
                        ...invoiceToPrint,
                        isEstimate: billType === 'estimate'
                      })}
                      disabled={sendingPdf}
                      className="w-full bg-success text-white py-2.5 px-4 rounded-lg font-medium hover:bg-success/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {sendingPdf ? <Spinner /> : <><Send className="size-4" /> Send on WhatsApp</>}
                    </button>
                  </ShowWrapper>
                  <button
                    onClick={() => handlePdfAction({
                      ...invoiceToPrint,
                      isEstimate: billType === 'estimate'
                    }, ACTION.DOWNLOAD)}
                    className="w-full bg-primary text-primary-foreground py-2.5 px-4 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="size-4" /> Download PDF
                  </button>
                  {isPosBasicPlan ? (
                    <button
                      onClick={() => {
                        const inv = invoiceToPrint;
                        setInvoiceToPrint(null);
                        handlePdfAction(
                          { ...inv, isEstimate: billType === 'estimate' },
                          ACTION.PRINT,
                          false
                        );
                      }}
                      className="w-full bg-card text-foreground border border-border py-2.5 px-4 rounded-lg font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
                    >
                      <Printer className="size-4" /> Print
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowPrintSubMenu(true)}
                      className="w-full bg-card text-foreground border border-border py-2.5 px-4 rounded-lg font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
                    >
                      <Printer className="size-4" /> Print
                    </button>
                  )}
                  <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                    <button onClick={() => handleShowQr(invoiceToPrint)} className="w-full bg-foreground text-background py-2.5 px-4 rounded-lg font-medium hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2">
                      <ScanLine className="size-4" /> Generate QR Code
                    </button>
                  </ShowWrapper>
                </>
              ) : (
                <>
                  <button onClick={() => handlePdfAction(invoiceToPrint, ACTION.DOWNLOAD)} className="w-full text-primary-foreground py-2.5 px-4 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 bg-primary" disabled>
                    <Download className="size-4" /> Download PDF
                  </button>

                  <button
                    onClick={() => {
                      handlePrintQr(invoiceToPrint);
                      setInvoiceToPrint(null);
                    }}
                    className="w-full bg-foreground text-background py-2.5 px-4 rounded-lg font-medium hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Printer className="size-4" /> Print QR
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!isPosBasicPlan && showPrintSubMenu && invoiceToPrint && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowPrintSubMenu(false)}
        >
          <div
            className="bg-card rounded-2xl p-6 w-full max-w-xs mx-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-4 text-center">
              Print Options
            </h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  const inv = invoiceToPrint;
                  setShowPrintSubMenu(false);
                  setInvoiceToPrint(null);
                  handlePdfAction(
                    { ...inv, isEstimate: billType === 'estimate' },
                    ACTION.PRINT,
                    false
                  );
                }}
                className="w-full border border-border py-2.5 rounded-lg font-bold text-sm"
              >
                Print (Bill Only)
              </button>
              <button
                onClick={() => {
                  const inv = invoiceToPrint;
                  setShowPrintSubMenu(false);
                  setInvoiceToPrint(null);
                  handlePdfAction(
                    { ...inv, isEstimate: billType === 'estimate' },
                    ACTION.PRINT,
                    true
                  );
                }}
                className="w-full border border-primary text-primary py-2.5 rounded-lg font-bold text-sm"
              >
                {enableTriplicate ? 'Print (Bill + 2 Duplicates)' : 'Print (Bill + Duplicate)'}
              </button>
              <button
                onClick={() => setShowPrintSubMenu(false)}
                className="w-full text-[11px] font-bold text-muted-foreground hover:text-foreground mt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showQrModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
            <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
            <h3 className="text-xl font-bold text-foreground mb-1">Download Bill</h3>
            <p className="text-sm text-muted-foreground mb-4">Invoice #{showQrModal.invoiceNumber}</p>
            <div className="bg-card p-2 border-2 border-border rounded-lg shadow-inner mb-4">
              <QRCode
                value={`${window.location.origin}/download-bill/${companyId}/${showQrModal.id}`}
                size={200}
                viewBox={`0 0 256 256`}
              />
            </div>
            <p className="text-center text-sm text-muted-foreground mb-4">Scan to download PDF</p>
            <button
              onClick={() => setShowQrModal(null)}
              className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
