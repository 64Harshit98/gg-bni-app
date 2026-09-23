import { useState } from 'react';
import { State } from '../../../enums';
import type { Order, OrderItem } from '../../Orders';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the BarcodeScanner's "purpose" flag (which of the
// two scan buttons — original-sale lookup vs. exchange-item lookup —
// opened it) and the shared onScanSuccess dispatcher (previously
// ~L82, ~L398-422).
//
// This handler genuinely spans two other hooks' domains (sale lookup via
// handleSelectSale from useSaleSelection, exchange-item lookup via
// handleExchangeItemSelected from useExchangeItems) plus the lifted
// salesList/availableItems/modal state, so rather than lifting yet more
// state to the parent, the already-owned lookup functions and read-only
// lists are threaded in as params — same pattern as setModal being passed
// into every hook that can raise an error.
// ─────────────────────────────────────────────────────────────────────────

interface UseBarcodeScanningParams {
  salesList: Order[];
  availableItems: OrderItem[];
  handleSelectSale: (order: Order) => void;
  handleExchangeItemSelected: (item: any) => void;
  setModal: (modal: { message: string; type: State } | null) => void;
}

export const useBarcodeScanning = ({
  salesList,
  availableItems,
  handleSelectSale,
  handleExchangeItemSelected,
  setModal,
}: UseBarcodeScanningParams) => {
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);

  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    if (purpose === 'sale') {
      const foundSale = salesList.find(
        sale =>
          sale.orderId === barcode &&
          ['paid', 'completed', 'confirmed']
            .includes(String(sale.status).toLowerCase())
      );

      if (foundSale) {
        handleSelectSale(foundSale);
      } else {
        setModal({ message: 'Original sale not found for this invoice.', type: State.ERROR });
      }
    } else if (purpose === 'item') {
      const itemToAdd = availableItems.find(item => item.id === barcode);
      if (itemToAdd) {
        handleExchangeItemSelected(itemToAdd);
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    }
  };

  return { scannerPurpose, setScannerPurpose, handleBarcodeScanned };
};
