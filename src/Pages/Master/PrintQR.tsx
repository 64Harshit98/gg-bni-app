import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import type { Item } from '../../constants/models';
import { getFirestoreOperations } from '../../lib/items_firebase';
import { Card, CardContent, CardHeader, CardTitle } from '../../Components/ui/card';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import { Input } from '../../Components/ui/input';
import QRCodeLib from 'qrcode';

// Helper types
type PrintableItem = Item & { quantityToPrint: number };
type PrefilledItem = { id: string, quantity: number, name: string };

// --- Preview Component ---
const LabelPreview: React.FC<{ item: Item, companyName: string }> = ({ item, companyName }) => {
    const [qrDataUrl, setQrDataUrl] = useState('');

    useEffect(() => {
        if (item.barcode) {
            QRCodeLib.toDataURL(item.barcode, { width: 150, margin: 1 }, (err: any, url: any) => {
                if (err) console.error(err);
                setQrDataUrl(url);
            });
        }
    }, [item.barcode]);

    return (
        <div className="w-[200px] h-[200px] border border-dashed border-gray-400 p-2 flex flex-col items-center justify-around font-sans bg-white shadow-lg mt-4">
            <div className="text-xs font-bold text-center">{companyName}</div>
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code Preview" className="w-28 h-28" />}
            <div className="text-[10px] text-center">{item.barcode}</div>
            <div className="text-[9px] font-bold text-center truncate w-full">{item.name}</div>
            <div className="text-xs font-bold text-center">{`MRP: ₹${item.mrp}`}</div>
        </div>
    );
};


const QRCodeGeneratorPage: React.FC = () => {
    const { currentUser } = useAuth();
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [printQueue, setPrintQueue] = useState<PrintableItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isPrinting, setIsPrinting] = useState(false);

    const [itemForPreview, setItemForPreview] = useState<PrintableItem | null>(null);
    const [companyName, setCompanyName] = useState<string>('Your Company');
    const [isPreviewOpen, setIsPreviewOpen] = useState(true);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const hasPrefilled = useRef(false);
    const location = useLocation();

    const dbOperations = useMemo(() => {
        if (currentUser?.companyId) {
            return getFirestoreOperations(currentUser.companyId);
        }
        return null;
    }, [currentUser]);

    // Effect to fetch items and business info
    useEffect(() => {
        if (!dbOperations) {
            setIsLoading(false); return;
        }
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [fetchedItems, businessInfo] = await Promise.all([
                    dbOperations.getItems(),
                    dbOperations.getBusinessInfo()
                ]);

                setAllItems(fetchedItems.filter(item => item.barcode && item.barcode.trim() !== ''));
                setCompanyName(businessInfo.name || 'Your Company');

            } catch (err) {
                // Set an error state here if you add it back
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [dbOperations]);

    // Effect to handle pre-filled items
    useEffect(() => {
        const prefilledItems = location.state?.prefilledItems as PrefilledItem[] | undefined;
        if (prefilledItems && allItems.length > 0 && !hasPrefilled.current) {
            const allItemsMap = new Map(allItems.map(item => [item.id, item]));
            const itemsToPrint = prefilledItems.map((pItem: PrefilledItem) => {
                const fullItem = allItemsMap.get(pItem.id);
                if (fullItem) {
                    return { ...fullItem, quantityToPrint: pItem.quantity };
                }
                return null;
            }).filter((item): item is PrintableItem => item !== null);
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

    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const itemIdsInQueue = new Set(printQueue.map(item => item.id));
        return allItems.filter(item => !itemIdsInQueue.has(item.id) && (item.name.toLowerCase().includes(lowerCaseSearchTerm) || item.barcode?.toLowerCase().includes(lowerCaseSearchTerm)));
    }, [searchTerm, allItems, printQueue]);

    const handleAddItemToQueue = useCallback((item: Item) => {
        if (printQueue.some(queuedItem => queuedItem.id === item.id)) return;
        setPrintQueue(prev => [...prev, { ...item, quantityToPrint: 1 }]);
        setSearchTerm('');
        searchInputRef.current?.focus();
    }, [printQueue]);

    const handleRemoveItemFromQueue = useCallback((itemId: string) => {
        setPrintQueue(prev => prev.filter(item => item.id !== itemId));
    }, []);

    const handleQuantityChange = useCallback((itemId: string, quantity: number) => {
        setPrintQueue(prev => prev.map(item =>
            item.id === itemId ? { ...item, quantityToPrint: Math.max(1, quantity) } : item
        ));
    }, []);

    const isPrintButtonDisabled = printQueue.length === 0 || isPrinting;

    // --- UPDATED: handlePrint function for your exact 3-column dimensions ---
    const handlePrint = useCallback(async () => {
        if (isPrintButtonDisabled || !dbOperations) return;

        setIsPrinting(true);

        try {
            const businessInfo = await dbOperations.getBusinessInfo();
            const companyName = businessInfo.name || 'Your Company';
            const businessAddress = businessInfo.address || '';
            const businessPhoneNumber = businessInfo.phoneNumber || '';

            const printWindow = window.open('', '', 'height=600,width=800');
            if (!printWindow) {
                throw new Error("Could not open print window. Please allow pop-ups.");
            }

            printWindow.document.write('<html><head><title>Print QR Code Labels</title>');
            printWindow.document.write('<style>');
            printWindow.document.write(`
                @page {
                    /* Total Width: 110mm, Label Height: 35mm */
                    size: 110mm 35mm;
                    margin: 0;
                }
                body { 
                    margin: 0; 
                    padding-left: 2.5mm; /* Left-side margin */
                    padding-right: 2.5mm; /* Right-side margin */
                    box-sizing: border-box;
                    font-family: sans-serif; 
                    display: flex; 
                    flex-wrap: wrap;
                    justify-content: space-between; /* Creates the 2.5mm gap */
                }
                .label-container { 
                    width: 35mm; 
                    height: 35mm; 
                    box-sizing: border-box; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    justify-content: space-between; 
                    padding: 1.5mm;
                    page-break-inside: avoid; 
                    text-align: center; 
                    overflow: hidden;
                }
                .company-name { font-size: 7pt; font-weight: bold; margin: 0; }
                .business-info { font-size: 5pt; margin: 0; line-height: 1; }
                .qr-image { width: 18mm; height: 18mm; object-fit: contain; }
                .item-barcode { font-size: 5pt; font-weight: bold; margin: 0; }
                .item-mrp { font-size: 7pt; font-weight: bold; margin: 0; }
            `);
            printWindow.document.write('</style></head><body>');

            for (const item of printQueue) {
                if (!item.barcode) continue;

                const qrDataUrl = await QRCodeLib.toDataURL(item.barcode, { width: 180, margin: 1 });

                for (let i = 0; i < item.quantityToPrint; i++) {
                    printWindow.document.write(`
                        <div class="label-container">
                            <div>
                                <p class="company-name">${companyName}</p>
                                <p class="business-info">${businessAddress}</p>
                                <p class="business-info">${businessPhoneNumber}</p>
                            </div>
                            <img class="qr-image" src="${qrDataUrl}" alt="QR Code" />
                            <div>
                                <p class="item-barcode">${item.barcode}</p>
                                <p class="item-barcode">${item.name}</p>
                                <p class="item-mrp">MRP: ₹${item.mrp}</p>
                            </div>
                        </div>
                    `);
                }
            }

            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); }, 500);

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
            <div className="flex flex-col gap-4">
                <div className="relative">
                    <Input ref={searchInputRef} type="text" placeholder="Search to add items to the print list..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pr-4 py-2 border rounded-lg" />
                    {searchResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {searchResults.map(item => (<button key={item.id} onClick={() => handleAddItemToQueue(item)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">{item.name}</button>))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 rounded-lg p-4 self-start">
                        <button
                            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                            className="w-full flex justify-between items-center text-lg font-semibold text-gray-700"
                        >
                            <span>Label Preview</span>
                            <span className={`transform transition-transform duration-200 ${isPreviewOpen ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                        </button>

                        {isPreviewOpen && (
                            <div className="flex flex-col items-center justify-center mt-4">
                                {itemForPreview ? (
                                    <LabelPreview item={itemForPreview} companyName={companyName} />
                                ) : (
                                    <div className="text-gray-500 py-10">Select an item from the cart to see a preview.</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-3">
                        {printQueue.length > 0 && <h3 className="text-lg font-semibold text-gray-700">Cart</h3>}
                        {printQueue.length === 0 && searchTerm.length === 0 && (<p className="text-center text-gray-500 py-8">Your cart is empty</p>)}

                        {printQueue.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setItemForPreview(item)}
                                className={`p-3 border rounded-lg bg-white shadow-sm flex flex-col gap-3 cursor-pointer transition-all ${itemForPreview?.id === item.id ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-200'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col text-sm text-gray-800 overflow-hidden pr-2"><span className="font-semibold text-base">{item.name}</span></div>
                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveItemFromQueue(item.id!); }} className="text-gray-400 hover:text-red-600 p-1 flex-shrink-0" aria-label={`Remove ${item.name}`}>
                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 font-medium">₹{item.mrp}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-500">Qty</span>
                                        <div className="flex items-center border border-gray-300 rounded-md">
                                            <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id!, item.quantityToPrint - 1); }} className="px-3 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100 rounded-l-md">-</button>
                                            <Input type="number" value={item.quantityToPrint} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); handleQuantityChange(item.id!, Number(e.target.value)); }} className="w-16 h-8 text-center border-l border-r rounded-none p-0 focus:ring-0" />
                                            <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id!, item.quantityToPrint + 1); }} className="px-3 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100 rounded-r-md">+</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {printQueue.length > 0 && (
                    <div className="border-t pt-4 mt-4">
                        <CustomButton onClick={handlePrint} disabled={isPrintButtonDisabled} variant={Variant.Filled} className="w-full py-3">
                            {isPrinting ? 'Printing...' : `Print Labels for ${printQueue.length} Items`}
                        </CustomButton>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle className="text-2xl text-center font-bold text-gray-800">Item QR Code Generator</CardTitle>
                </CardHeader>
                <CardContent>{renderContent()}</CardContent>
            </Card>
        </div>
    );
};

export default QRCodeGeneratorPage;