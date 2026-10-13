import { useState, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';
import { parseRawText, type ParsedData, type ParsedItem } from '../utils/DocumentParser';

// Shape of one item as returned by the backend's coordinate-based band detection
// (see buildItemsFromBands in index.js) — note it has no `id`, ParsedItem needs one.
interface BackendScanItem {
    name: string;
    quantity: number;
    unit: string;
    purchasePrice: number;
    discountPercentage: number;
    totalAmount: number;
}

// Converts backend's structured items into ParsedItem[], generating the `id`
// that React needs as a key (backend intentionally omits it).
const backendItemsToParsedItems = (items: BackendScanItem[]): ParsedItem[] =>
    items.map(it => ({
        id: crypto.randomUUID(),
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        purchasePrice: it.purchasePrice,
        discountPercentage: it.discountPercentage,
        totalAmount: it.totalAmount,
    }));

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const MAX_PDF_PAGES = 5;
// Mirrors the shape of a band in the backend's buildBands() (index.js) --
// opaque to the frontend, just carried forward from one page's response
// into the next page's request.
interface ScanBand { key: string; pct: boolean; xStart: number; xEnd: number; }
type ScanResponse = { success: boolean; text: string; items?: BackendScanItem[]; bands?: ScanBand[] };

const renderPageToJpeg = async (pdf: pdfjsLib.PDFDocumentProxy, pageNo: number): Promise<string> => {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context failed to initialize.');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport } as any).promise;
    return canvas.toDataURL('image/jpeg', 0.9);
};

// Regex parser supplies amount/date/ref (and items only if the backend found none).
const buildExtractedData = (text: string, backendItems: BackendScanItem[]): ParsedData | null => {
    if (!text) return null;
    let data = parseRawText(text);
    if (backendItems.length > 0) data = { ...data, items: backendItemsToParsedItems(backendItems) };
    // No "Total" printed/detected? Fall back to the sum of the line amounts.
    if (!data.amount && data.items.length > 0) {
        data = { ...data, amount: data.items.reduce((s, i) => s + i.totalAmount, 0).toFixed(2) };
    }
    return data;
};

// Helper to convert the physical File object into a Base64 string for the Cloud Function
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

export const useSmartScanner = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scannedData, setScannedData] = useState<ParsedData | null>(null);

    // Initialize Firebase Functions
    const functions = getFunctions();
    const scanSmartInvoice = httpsCallable(functions, 'scanSmartInvoice');

    const processFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        let extractedData: ParsedData | null = null;

        try {
            if (file.type === 'text/csv') {
                extractedData = await new Promise((resolve, reject) => {
                    Papa.parse(file, {
                        header: true,
                        complete: (results: any) => {
                            const firstRow = results.data[0] || {};
                            resolve({
                                amount: firstRow['Total'] || firstRow['Amount'] || '',
                                date: firstRow['Date'] || '',
                                referenceNumber: firstRow['Invoice'] || firstRow['Ref'] || '',
                                items: [],
                                rawText: JSON.stringify(firstRow)
                            });
                        },
                        error: reject
                    });
                });
            } else if (file.type === 'application/pdf') {
                const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
                const texts: string[] = [];
                const items: BackendScanItem[] = [];
                let previousBands: ScanBand[] | undefined;

                for (let p = 1; p <= Math.min(pdf.numPages, MAX_PDF_PAGES); p++) {
                    const res = await scanSmartInvoice({ imageBase64: await renderPageToJpeg(pdf, p), previousBands });
                    const d = res.data as ScanResponse;
                    console.log(`[SmartScan] Page ${p} raw text:\n`, d.text);
                    console.log(`[SmartScan] Page ${p} structured items:`, d.items);
                    console.log(`[SmartScan] Page ${p} bands used:`, d.bands);
                    if (d.text) texts.push(d.text);
                    if (d.items) items.push(...d.items);
                    if (d.bands && d.bands.length > 0) previousBands = d.bands; // reused if next page's own header isn't found
                }
                extractedData = buildExtractedData(texts.join('\n'), items);

            } else if (file.type.startsWith('image/')) {
                const res = await scanSmartInvoice({ imageBase64: await fileToBase64(file) });
                const d = res.data as ScanResponse;
                console.log('[SmartScan] raw text:\n', d.text);
               console.log('[SmartScan] structured items:', d.items);
                extractedData = buildExtractedData(d.text, d.items ?? []);

            } else {
                throw new Error("Unsupported file type");
            }

            if (extractedData) setScannedData(extractedData);

        } catch (err) {
            console.error("Smart Scan Failed", err);
            alert("Could not process the document automatically.");
        } finally {
            setIsScanning(false);
            if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
        }
    };

    const clearScannedData = () => setScannedData(null);

    return { fileInputRef, isScanning, scannedData, setScannedData, processFile, clearScannedData };
};