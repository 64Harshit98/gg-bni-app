import React from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../../../Components/ui/button';

export interface SmartScanExtractedItem {
  name: string;
  quantity: number;
  unit?: string;
  purchasePrice: number;
}

interface SmartScanVerifyModalProps {
  amount: string;
  items: SmartScanExtractedItem[];
  onAmountChange: (value: string) => void;
  onCancel: () => void;
  onApply: () => void;
}

/**
 * "Verify Extracted Items" confirmation shown after the smart-scan OCR flow
 * parses a supplier bill. Extracted verbatim (styling reskinned onto design
 * tokens) from `Purchase.tsx`'s inline `scannedData` modal.
 */
export const SmartScanVerifyModal: React.FC<SmartScanVerifyModalProps> = ({
  amount,
  items,
  onAmountChange,
  onCancel,
  onApply,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl">
        <h3 className="mb-4 flex items-center gap-2 border-b border-border pb-2 text-lg font-bold text-foreground">
          <FileText className="text-primary" size={18} /> Verify Extracted Items
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Total Amount Found</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {items && items.length > 0 ? (
            <div className="mt-4 border-t border-border pt-4">
              <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                Items Found ({items.length})
              </label>
              <div className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-muted p-2 text-xs">
                    <span className="w-3/5 truncate pr-2 font-medium text-foreground" title={item.name}>
                      {item.name}
                    </span>
                    <span className="w-1/5 text-right text-muted-foreground">
                      {item.quantity} {item.unit}
                    </span>
                    <span className="w-1/5 text-right font-semibold text-primary">₹{item.purchasePrice}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[9px] text-muted-foreground">
                These items will be matched with your inventory when applied.
              </p>
            </div>
          ) : (
            <div className="mt-4 border-t border-border pt-4 text-center">
              <p className="rounded-md border border-warning/20 bg-warning/10 p-2 text-xs font-medium text-warning">
                No items could be automatically extracted from this format.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onApply}>Apply Items to Bill</Button>
        </div>
      </div>
    </div>
  );
};
