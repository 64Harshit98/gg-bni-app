import React from 'react';
import { ACTION } from '../../../enums';
import type { Invoice } from '../journal.types';

interface PrintSubMenuModalProps {
  invoiceToPrint: Invoice;
  setInvoiceToPrint: (invoice: Invoice | null) => void;
  setShowPrintSubMenu: (v: boolean) => void;
  billType: 'estimate' | 'bill';
  enableTriplicate: boolean;
  handlePdfAction: (invoice: Invoice, action: ACTION.DOWNLOAD | ACTION.PRINT, withDuplicate?: boolean) => void;
}

// Print-submenu modal (Bill-only vs Bill+Duplicate/Triplicate) — moved
// verbatim from Journal.tsx.
export const PrintSubMenuModal: React.FC<PrintSubMenuModalProps> = ({
  invoiceToPrint,
  setInvoiceToPrint,
  setShowPrintSubMenu,
  billType,
  enableTriplicate,
  handlePdfAction,
}) => {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={() => setShowPrintSubMenu(false)}
    >
      <div
        className="bg-white rounded-sm p-6 w-full max-w-xs mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 text-center">
          Print Options
        </h3>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              const inv = invoiceToPrint;
              setShowPrintSubMenu(false);
              setInvoiceToPrint(null);
              handlePdfAction(
                { ...inv, isEstimate: billType === 'estimate' } as any,
                ACTION.PRINT,
                false
              );
            }}
            className="w-full border py-2.5 rounded-sm font-bold text-sm"
          >
            Print (Bill Only)
          </button>
          <button
            onClick={() => {
              const inv = invoiceToPrint;
              setShowPrintSubMenu(false);
              setInvoiceToPrint(null);
              handlePdfAction(
                { ...inv, isEstimate: billType === 'estimate' } as any,
                ACTION.PRINT,
                true
              );
            }}
            className="w-full border border-blue-500 text-blue-600 py-2.5 rounded-sm font-bold text-sm"
          >
            {enableTriplicate ? 'Print (Bill + 2 Duplicates)' : 'Print (Bill + Duplicate)'}
          </button>
          <button
            onClick={() => setShowPrintSubMenu(false)}
            className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-700 mt-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
