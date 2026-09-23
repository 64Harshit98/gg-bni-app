import { useState } from 'react';
import Fuse from 'fuse.js';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import { useSmartScanner } from '../../../hooks/SmartScanner';
import type { PurchaseItem } from '../purchase.types';

interface UsePurchaseSmartScanParams {
    availableItems: Item[];
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
    // Owned by usePurchaseCart — handleBarcodeScanned re-uses the same
    // add-to-cart pricing logic rather than duplicating it, so it's threaded
    // in as a plain param instead of moving addItemToCart here.
    addItemToCart: (itemToAdd: Item) => void;
    setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns the Purchase-specific bill-scanner ("Smart Scan") subsystem — moved
// verbatim from Purchase.tsx: the useSmartScanner wiring, showScannerModal,
// isScannerOpen, handleApplySmartScan (Fuse.js item matching against
// availableItems), and handleBarcodeScanned. No Sales equivalent — this only
// exists on the Purchase side.
export const usePurchaseSmartScan = ({
    availableItems,
    setItems,
    addItemToCart,
    setModal,
}: UsePurchaseSmartScanParams) => {
    const { fileInputRef, isScanning, scannedData, setScannedData, processFile, clearScannedData } = useSmartScanner();
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const handleApplySmartScan = () => {
        if (scannedData) {
            // We intentionally DO NOT update setInvoiceNumber or setInvoiceDate here anymore.
            // The scanner acts strictly as an item importer.

            if (scannedData.items && scannedData.items.length > 0) {

                const fuse = new Fuse(availableItems, {
                    keys: ['name', 'barcode'],
                    threshold: 0.4,
                    distance: 100
                });

                const newCartItems = scannedData.items.map(ocrItem => {
                    const ocrNetPrice = ocrItem.purchasePrice * (1 - (ocrItem.discountPercentage / 100));
                    const roundedOcrNetPrice = Math.round(ocrNetPrice * 100) / 100;

                    const searchResults = fuse.search(ocrItem.name);

                    // LINKED ITEM (Found in DB)
                    if (searchResults.length > 0) {
                        const dbItem = searchResults[0].item;
                        const finalDiscount = ocrItem.discountPercentage || (dbItem as any).purchasediscount || 0;
                        const finalMrp = dbItem.mrp || ocrItem.purchasePrice;

                        const finalDbNetPrice = finalMrp * (1 - (finalDiscount / 100));
                        const roundedDbNetPrice = Math.round(finalDbNetPrice * 100) / 100;

                        return {
                            id: crypto.randomUUID(),
                            productId: dbItem.id,
                            name: dbItem.name,
                            unit: dbItem.unit || ocrItem.unit,
                            purchasePrice: roundedDbNetPrice,
                            originalPurchasePrice: dbItem.purchasePrice,
                            mrp: finalMrp,
                            barcode: dbItem.barcode || '',
                            quantity: ocrItem.quantity || 1,
                            unitMultiplier: 1,
                            discount: finalDiscount,
                            purchasediscount: finalDiscount,
                            taxRate: dbItem.tax || dbItem.taxRate || 0,
                            stock: dbItem.stock || 0,
                            isEditable: true
                        };
                    }

                    // UNLINKED ITEM (Not in DB)
                    return {
                        id: crypto.randomUUID(),
                        productId: crypto.randomUUID(),
                        name: `⚠️ ${ocrItem.name} (Not in DB)`,
                        unit: ocrItem.unit,
                        purchasePrice: roundedOcrNetPrice,
                        originalPurchasePrice: ocrItem.purchasePrice,
                        mrp: ocrItem.purchasePrice,
                        barcode: '',
                        quantity: ocrItem.quantity,
                        unitMultiplier: 1,
                        discount: ocrItem.discountPercentage,
                        purchasediscount: ocrItem.discountPercentage,
                        taxRate: 0,
                        stock: 0,
                        isEditable: true
                    };
                });

                // Append items to cart
                setItems(prev => [...prev, ...newCartItems]);
            }

            clearScannedData();
            setModal({ message: 'Items linked and applied successfully!', type: State.SUCCESS });
            setTimeout(() => setModal(null), 1500);
        }
    };

    const handleBarcodeScanned = (barcode: string) => {
        setIsScannerOpen(false);
        const itemToAdd = availableItems.find(item => item.barcode === barcode);
        if (itemToAdd) {
            addItemToCart(itemToAdd);
        } else {
            setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
        }
    };

    return {
        fileInputRef, isScanning, scannedData, setScannedData, processFile, clearScannedData,
        showScannerModal, setShowScannerModal,
        isScannerOpen, setIsScannerOpen,
        handleApplySmartScan,
        handleBarcodeScanned,
    };
};
