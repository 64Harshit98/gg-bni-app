import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import type { Item } from '../../constants/models';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { Card, CardContent, CardHeader, CardTitle } from '../../Components/ui/card';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import { Input } from '../../Components/ui/input';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import { IconClose } from '../../constants/Icons';
import BackButton from '../../Components/BackButton';

// --- Data Types ---
type PrintableItem = Item & {
    quantityToPrint: number;
    queueId: string;
};

type PrefilledItem = { barcode: string, quantity: number, name: string };

// --- Preview Component ---
const LabelPreview: React.FC<{ item: Item, companyName: string }> = ({ item, companyName }) => {
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [barcodeDataUrl, setBarcodeDataUrl] = useState('');

    useEffect(() => {
        if (item.barcode) {
            QRCodeLib.toDataURL(item.barcode, { width: 140, margin: 1 })
                .then(url => setQrDataUrl(url))
                .catch(err => console.error(err));

            const canvas = document.createElement('canvas');
            try {
                JsBarcode(canvas, item.barcode, {
                    format: 'CODE128',
                    displayValue: false,
                    height: 40,
                    width: 1,
                    margin: 0,
                });
                setBarcodeDataUrl(canvas.toDataURL('image/png'));
            } catch (e) {
                console.error("Invalid barcode format", e);
            }
        }
    }, [item.barcode]);

    return (
        <div className="w-[200px] h-[200px] border border-dashed border-gray-400 p-2 flex flex-col items-center justify-around font-sans bg-white shadow-lg mt-4">
            <div className="text-xs font-bold text-center">{companyName}</div>
            <div className="flex flex-col justify-center items-center h-28">
                {barcodeDataUrl && (
                    <div className="w-24 h-8 flex items-center justify-center overflow-hidden mb-1">
                        <img src={barcodeDataUrl} alt="Barcode Preview" className="w-24 h-8" />
                    </div>
                )}
                {qrDataUrl && <img src={qrDataUrl} alt="QR Code Preview" className="w-24 h-24" />}
            </div>
            <div className="text-[10px] text-center">{item.barcode}</div>
            <div className="text-xs font-bold text-center">{`MRP: ₹${item.mrp || item.salesPrice || 0}`}</div>
        </div>
    );
};

const QRCodeGeneratorPage: React.FC = () => {
    const { currentUser } = useAuth();
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [printQueue, setPrintQueue] = useState<PrintableItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isPrinting, setIsPrinting] = useState(false);
    const [itemForPreview, setItemForPreview] = useState<PrintableItem | null>(null);
    const [companyName, setCompanyName] = useState<string>('Your Company');
    const [isPreviewOpen, setIsPreviewOpen] = useState(true);

    const hasPrefilled = useRef(false);
    const location = useLocation();

    const dbOperations = useMemo(() => {
        if (currentUser?.companyId) {
            return getFirestoreOperations(currentUser.companyId);
        }
        return null;
    }, [currentUser]);

    useEffect(() => {
        if (!dbOperations) {
            setIsLoading(false); return;
        }
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [fetchedItems, businessInfo] = await Promise.all([
                    dbOperations.syncItems(),
                    dbOperations.getBusinessInfo()
                ]);

                setAllItems(fetchedItems.filter(item => item.barcode && item.barcode.trim() !== ''));
                setCompanyName(businessInfo.name || 'Your Company');

            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [dbOperations]);

    useEffect(() => {
        const prefilledItems = location.state?.prefilledItems as PrefilledItem[] | undefined;
        if (prefilledItems && allItems.length > 0 && !hasPrefilled.current) {
            const allItemsMap = new Map(allItems.map(item => [item.id, item]));

            const itemsToPrint = prefilledItems.map((pItem: PrefilledItem) => {
                const fullItem = allItemsMap.get(pItem.barcode); // Assuming barcode is used as lookup or ID
                // Note: If pItem.barcode corresponds to item.id, use that. Otherwise search by barcode field:
                const matchedItem = fullItem || allItems.find(i => i.barcode === pItem.barcode);

                if (matchedItem) {
                    return {
                        ...matchedItem,
                        quantityToPrint: pItem.quantity,
                        queueId: crypto.randomUUID() as string
                    };
                }
                return null;
            }).filter((item) => item !== null) as PrintableItem[];

            setPrintQueue(itemsToPrint);
            if (itemsToPrint.length > 0) {
                setItemForPreview(itemsToPrint[0]);
            }
            hasPrefilled.current = true;
        }
    }, [location.state, allItems]);

    useEffect(() => {
        if (!itemForPreview && printQueue.length > 0) {
            setItemForPreview(printQueue[0]);
        } else if (printQueue.length === 0) {
            setItemForPreview(null);
        }
    }, [printQueue, itemForPreview]);

    const availableItemsForSearch = useMemo(() => {
        const itemIdsInQueue = new Set(printQueue.map(item => item.id));
        return allItems.filter(item => !itemIdsInQueue.has(item.id));
    }, [allItems, printQueue]);

    const handleAddItemToQueue = useCallback((item: Item) => {
        if (printQueue.some(queuedItem => queuedItem.id === item.id)) return;

        const newItem: PrintableItem = {
            ...item,
            quantityToPrint: 1,
            queueId: crypto.randomUUID() as string
        };

        setPrintQueue(prev => [...prev, newItem]);
    }, [printQueue]);

    const handleRemoveItemFromQueue = useCallback((queueId: string) => {
        setPrintQueue(prev => prev.filter(item => item.queueId !== queueId));
    }, []);

    const handleQuantityChange = useCallback((queueId: string, quantity: number) => {
        setPrintQueue(prev => prev.map(item =>
            item.queueId === queueId ? { ...item, quantityToPrint: Math.max(1, quantity) } : item
        ));
    }, []);

    const isPrintButtonDisabled = printQueue.length === 0 || isPrinting;

    // --- UPDATED PRINT LOGIC ---
    const handlePrint = useCallback(async () => {
        if (isPrintButtonDisabled || !dbOperations) return;

        setIsPrinting(true);

        try {
            const businessInfo = await dbOperations.getBusinessInfo();
            const companyName = businessInfo.name || 'Your Company';
            const businessAddress = (businessInfo.address || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const businessPhoneNumber = (businessInfo.phoneNumber || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

            // 1. Pre-generate all HTML strings
            let allLabelsHtml = '';
            const canvas = document.createElement('canvas'); // Shared canvas for generation

            for (const item of printQueue) {
                if (!item.barcode) continue;

                // Generate QR (Async)
                const qrDataUrl = await QRCodeLib.toDataURL(item.barcode, { width: 150, margin: 1 });

                // Generate Barcode (Sync)
                try {
                    JsBarcode(canvas, item.barcode, {
                        format: 'CODE128',
                        displayValue: false,
                        height: 40,
                        width: 1.5,
                        margin: 0,
                    });
                } catch (e) {
                    console.warn(`Could not generate barcode for ${item.name}`, e);
                    continue;
                }
                const barcodeDataUrl = canvas.toDataURL('image/png');

                // Build HTML for *Quantity* times
                for (let i = 0; i < item.quantityToPrint; i++) {
                    allLabelsHtml += `
                        <div class="label-container">
                            <div>
                                <p class="company-name">${companyName}</p>
                                <div class="info-row">
                                    <p class="business-info info-left">${businessAddress}</p>
                                    <p class="business-info info-right">${businessPhoneNumber}</p>
                                </div>
                            </div>
                            <div class="barcode-area">
                                <img class="barcode-image" src="${barcodeDataUrl}" alt="Barcode - ${item.barcode}" />
                                <img class="qr-image" src="${qrDataUrl}" alt="QR - ${item.barcode}" />
                            </div>
                            <div>
                                <p class="item-barcode">${item.barcode}</p>
                                <p class="item-name">${item.name}</p>
                                <p class="item-mrp">MRP: ₹${item.mrp || item.salesPrice || 0}</p>
                            </div>
                        </div>
                    `;
                }
            }

            // 2. Open Window only after data is ready
            const printWindow = window.open('', '', 'height=600,width=800');
            if (!printWindow) {
                throw new Error("Could not open print window. Please allow pop-ups.");
            }

            // 3. Write Full HTML
            printWindow.document.write(`
                <html>
                <head>
                    <title>Print Labels</title>
                    <style>
                        @page { size: 110mm 35mm; margin: 0; }
                        body { margin: 0; padding-left: 2.5mm; padding-right: 2.5mm; box-sizing: border-box; font-family: sans-serif; display: flex; flex-wrap: wrap; justify-content: space-between; }
                        .label-container { width: 35mm; height: 35mm; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 0.5mm; page-break-inside: avoid; text-align: center; overflow: hidden; }
                        .company-name { font-size: 7pt; font-weight: bold; margin: 0; text-align: center; }
                        .business-info { font-size: 5pt; margin:0; }
                        .info-row { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-top: 0.5mm; }
                        .info-left { text-align: left; width: 60%; white-space: pre-wrap; word-wrap: break-word; }
                        .info-right { text-align: right; width: 40%; }
                        .barcode-area { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; margin-top: -5mm; margin-bottom: -4mm; }
                        .qr-image { width: 14mm; height: 14mm; object-fit: contain; }
                        .barcode-image { width: 30mm; height: 16mm; object-fit: contain; margin-bottom:-6mm; margin-top: -2mm; }
                        .item-barcode { font-size: 4pt; font-weight: bold; margin: 0; }
                        .item-name { font-size: 6pt; font-weight: bold; margin: 0; }
                        .item-mrp { font-size: 7pt; font-weight: bold; margin: 0; }
                    </style>
                </head>
                <body>
                    ${allLabelsHtml}
                    <script>
                        // Wait for everything to fully render before printing
                        window.onload = function() {
                            setTimeout(function() { 
                                window.print(); 
                            }, 500);
                        }
                    </script>
                </body>
                </html>
            `);

            printWindow.document.close();

        } catch (err: any) {
            console.error("Printing failed:", err);
            alert(`Printing failed: ${err.message}.`);
        } finally {
            setIsPrinting(false);
        }
    }, [printQueue, isPrintButtonDisabled, dbOperations]);

    const renderContent = () => {
        if (isLoading) return <p className="text-center text-gray-500">Loading items...</p>;

        return (
            <div className="flex flex-col gap-5 bg-white/80 p-4 rounded-sm border border-gray-100 shadow-sm">

  {/* Search */}
  <div className="relative">
    <SearchableItemInput
      label=""
      placeholder="Search to add items to the print list..."
      items={availableItemsForSearch}
      onItemSelected={handleAddItemToQueue}
    />
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    {/* Preview Section */}
    <div className="bg-gray-50 rounded-sm p-3 self-start border border-gray-100">
      <button
        onClick={() => setIsPreviewOpen(!isPreviewOpen)}
        className="w-full flex justify-between items-center text-sm font-medium text-gray-800"
      >
        <span>Label Preview</span>
        <span
          className={`text-xs text-gray-500 transition-transform duration-200 ${
            isPreviewOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          ▼
        </span>
      </button>

      {isPreviewOpen && (
        <div className="mt-3 rounded-sm border border-dashed border-gray-200 bg-white flex items-center justify-center px-4 py-6">
          {itemForPreview ? (
            <LabelPreview item={itemForPreview} companyName={companyName} />
          ) : (
            <div className="text-xs text-gray-400 text-center">
              Select an item from the cart to preview its label.
            </div>
          )}
        </div>
      )}
    </div>

    {/* Queue List */}
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {printQueue.length > 0 ? (
          <>
            <h3 className="text-sm font-medium text-gray-800">Cart</h3>
            <span className="text-xs text-gray-500">
              {printQueue.length} item{printQueue.length > 1 ? "s" : ""} selected
            </span>
          </>
        ) : (
          <h3 className="text-sm font-medium text-gray-400">Cart</h3>
        )}
      </div>

      {printQueue.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-gray-200 bg-gray-50 py-8">
          <p className="text-xs text-gray-500">Your cart is empty.</p>
          <p className="text-[11px] text-gray-400">Search above to add items to the print list.</p>
        </div>
      )}

      {printQueue.map((item) => (
        <div
          key={item.queueId}
          onClick={() => setItemForPreview(item)}
          className={`p-2 border rounded-sm bg-white flex items-center justify-between gap-2 cursor-pointer transition shadow-sm hover:shadow-md ${
            itemForPreview?.queueId === item.queueId
              ? "border-blue-400 ring-1 ring-blue-100"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 flex-1 overflow-hidden">
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-[12px] truncate">{item.name}</span>
              <span className="text-[10px] text-gray-500 truncate">Barcode: {item.barcode}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-gray-800">₹{item.mrp || item.salesPrice || 0}</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-gray-500">Qty</span>
              <div className="flex items-center border border-gray-200 rounded-sm overflow-hidden bg-gray-50 h-7">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(item.queueId, item.quantityToPrint - 1);
                  }}
                  className="px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  -
                </button>
                <Input
                  type="number"
                  value={item.quantityToPrint}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(item.queueId, Number(e.target.value));
                  }}
                  className="w-12 h-7 text-center text-xs border-x border-gray-200 rounded-sm p-0 focus:ring-0 bg-white"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(item.queueId, item.quantityToPrint + 1);
                  }}
                  className="px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  +
                </button>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveItemFromQueue(item.queueId);
              }}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <IconClose width={14} height={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>

  {printQueue.length > 0 && (
    <div className="border-t border-gray-100 pt-4 mt-4 flex flex-col items-center gap-3">
      <p className="text-[11px] text-gray-500">
        Ready to print QR labels for{" "}
        <span className="font-medium text-gray-700">
          {printQueue.length} item{printQueue.length > 1 ? "s" : ""}
        </span>
        .
      </p>

      <div className="w-full flex justify-center">
        <CustomButton
          onClick={handlePrint}
          disabled={isPrintButtonDisabled}
          variant={Variant.Filled}
          className="w-60 py-3 !rounded-sm !bg-gray-900 !text-white !text-sm !font-semibold hover:!bg-black"
        >
          {isPrinting ? "Generating..." : "Print labels"}
        </CustomButton>
      </div>
    </div>
  )}
</div>
        );
    };

    return (
        <Card className="max-w-4xl mx-auto mb-16">
            <CardHeader className="flex items-center justify-between">
                <BackButton/>
                <CardTitle className="text-lg font-bold text-gray-800 text-center flex-1">
                    Item QR Code Generator
                </CardTitle>

                <div className="w-8" /> 
            </CardHeader>
            <CardContent>{renderContent()}</CardContent>
        </Card>
    );
};

export default QRCodeGeneratorPage;