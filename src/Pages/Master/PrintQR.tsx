import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import type { Item } from '../../constants/models';
import { fetchPrintQRData, fetchCompanyBusinessInfo } from '../../services/printQR.service';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { Spinner } from '../../Components/ui/spinner';
import { EmptyState } from '../../Components/ui/empty-state';
import { QrCode, ChevronDown, Minus, Plus, X, Printer, PackageSearch } from 'lucide-react';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
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
        // NOTE: this mirrors the physical printed label (white paper stock),
        // so it intentionally stays white/black regardless of app theme.
        <div className="w-[200px] h-[200px] border border-dashed border-neutral-400 p-2 flex flex-col items-center justify-around font-sans bg-white text-black shadow-lg mt-4 rounded-sm">
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
            <div className="text-xs font-bold text-center">{`MRP: ₹${item.mrp}`}</div>
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
    const companyId = currentUser?.companyId;

    useEffect(() => {
        if (!companyId) {
            setIsLoading(false); return;
        }
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const data = await fetchPrintQRData(companyId);
                setAllItems(data.items);
                setCompanyName(data.companyName);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [companyId]);

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

    // --- PRINT LOGIC ---
    const handlePrint = useCallback(async () => {
        if (isPrintButtonDisabled || !companyId) return;

        setIsPrinting(true);

        try {
            const businessInfo = await fetchCompanyBusinessInfo(companyId);
            const companyNameForPrint = businessInfo.name || 'Your Company';
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
                                <p class="company-name">${companyNameForPrint}</p>
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
                                <p class="item-mrp">MRP: ₹${item.mrp}</p>
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

        } catch (err) {
            console.error("Printing failed:", err);
            alert(`Printing failed: ${err instanceof Error ? err.message : 'Unknown error'}.`);
        } finally {
            setIsPrinting(false);
        }
    }, [printQueue, isPrintButtonDisabled, companyId]);

    const renderContent = () => {
        if (isLoading) return (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                <Spinner size="lg" />
                <p className="text-sm font-medium">Loading items...</p>
            </div>
        );

        return (
            <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-6">

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
                    <div className="rounded-xl bg-muted p-3 self-start border border-border">
                        <button
                            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                            className="w-full flex justify-between items-center text-sm font-medium text-foreground"
                        >
                            <span>Label Preview</span>
                            <ChevronDown
                                className={`size-4 text-muted-foreground transition-transform duration-200 ${isPreviewOpen ? "rotate-180" : "rotate-0"
                                    }`}
                            />
                        </button>

                        {isPreviewOpen && (
                            <div className="mt-3 rounded-xl border border-dashed border-border bg-card flex items-center justify-center px-4 py-6">
                                {itemForPreview ? (
                                    <LabelPreview item={itemForPreview} companyName={companyName} />
                                ) : (
                                    <div className="text-xs text-muted-foreground text-center">
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
                                    <h3 className="text-sm font-medium text-foreground">Cart</h3>
                                    <span className="text-xs text-muted-foreground">
                                        {printQueue.length} item{printQueue.length > 1 ? "s" : ""} selected
                                    </span>
                                </>
                            ) : (
                                <h3 className="text-sm font-medium text-muted-foreground">Cart</h3>
                            )}
                        </div>

                        {printQueue.length === 0 && (
                            <EmptyState
                                icon={<PackageSearch />}
                                title="Your cart is empty"
                                description="Search above to add items to the print list."
                                className="border-border bg-muted py-8"
                            />
                        )}

                        {printQueue.map((item) => (
                            <div
                                key={item.queueId}
                                onClick={() => setItemForPreview(item)}
                                className={`p-2 border rounded-xl bg-card flex items-center justify-between gap-2 cursor-pointer transition shadow-xs hover:shadow-md ${itemForPreview?.queueId === item.queueId
                                    ? "border-primary/50 ring-1 ring-primary/20"
                                    : "border-border"
                                    }`}
                            >
                                <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-medium text-[12px] truncate text-foreground">{item.name}</span>
                                        <span className="text-[10px] text-muted-foreground truncate">Barcode: {item.barcode}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-foreground">₹{item.mrp}</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] text-muted-foreground">Qty</span>
                                        <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted h-7">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleQuantityChange(item.queueId, item.quantityToPrint - 1);
                                                }}
                                                className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                <Minus className="size-3" />
                                            </button>
                                            <Input
                                                type="number"
                                                value={item.quantityToPrint}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    handleQuantityChange(item.queueId, Number(e.target.value));
                                                }}
                                                className="w-12 h-7 text-center text-xs border-x border-border rounded-none p-0 focus-visible:ring-0 bg-card"
                                            />
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleQuantityChange(item.queueId, item.quantityToPrint + 1);
                                                }}
                                                className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                <Plus className="size-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveItemFromQueue(item.queueId);
                                        }}
                                        className="text-muted-foreground hover:text-destructive p-1"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {printQueue.length > 0 && (
                    <div className="border-t border-border pt-4 mt-4 flex flex-col items-center gap-3">
                        <p className="text-[11px] text-muted-foreground">
                            Ready to print QR labels for{" "}
                            <span className="font-medium text-foreground">
                                {printQueue.length} item{printQueue.length > 1 ? "s" : ""}
                            </span>
                            .
                        </p>

                        <div className="w-full flex justify-center">
                            <Button
                                onClick={handlePrint}
                                disabled={isPrintButtonDisabled}
                                size="lg"
                                className="w-60 gap-2 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90"
                            >
                                {isPrinting ? (
                                    <>
                                        <Spinner size="sm" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Printer className="size-4" />
                                        Print labels
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="aurora flex h-full w-full flex-col overflow-hidden bg-muted">
            <header className="glass mx-3 mt-3 flex flex-shrink-0 items-center gap-3 rounded-2xl p-3 shadow-sm">
                <BackButton />
                <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
                        <QrCode className="size-4" />
                    </span>
                </div>
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                        Item <span className="text-gradient">QR Code Generator</span>
                    </h1>
                    <p className="text-xs text-muted-foreground">Search items, queue labels, and print in one batch</p>
                </div>
            </header>

            <main className="w-full flex-grow overflow-y-auto p-4 sm:p-6">
                <div className="mx-auto w-full max-w-7xl">{renderContent()}</div>
            </main>
        </div>
    );
};

export default QRCodeGeneratorPage;
