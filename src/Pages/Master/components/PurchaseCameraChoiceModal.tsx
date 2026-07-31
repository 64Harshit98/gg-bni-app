import React from 'react';
import { ScanLine, FileText } from 'lucide-react';

interface PurchaseCameraChoiceModalProps {
  onScanItem: () => void;
  onUploadBill: () => void;
  onClose: () => void;
}

/**
 * "Choose Action" picker (scan a single item's barcode vs. upload a full
 * supplier bill for smart-scan OCR). Extracted verbatim (styling reskinned
 * onto design tokens) from `Purchase.tsx`'s inline `showScannerModal` modal.
 */
export const PurchaseCameraChoiceModal: React.FC<PurchaseCameraChoiceModalProps> = ({
  onScanItem,
  onUploadBill,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-center text-lg font-bold text-foreground">Choose Action</h3>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onScanItem}
            className="group flex flex-col items-center justify-center rounded-xl border-2 border-border p-6 transition-all hover:border-primary hover:bg-primary/5"
          >
            <ScanLine className="mb-3 size-8 text-muted-foreground group-hover:text-primary" />
            <span className="text-sm font-semibold text-foreground group-hover:text-primary">Scan Item</span>
          </button>

          <button
            onClick={onUploadBill}
            className="group flex flex-col items-center justify-center rounded-xl border-2 border-border p-6 transition-all hover:border-primary hover:bg-primary/5"
          >
            <FileText className="mb-3 size-8 text-muted-foreground group-hover:text-primary" />
            <span className="text-sm font-semibold text-foreground group-hover:text-primary">Upload Bill</span>
          </button>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={onClose}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
