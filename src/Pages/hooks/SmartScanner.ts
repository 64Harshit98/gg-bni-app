import { useState, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';
import { parseRawText, type ParsedData } from '../utils/DocumentParser';

// Set up PDF.js worker
// Uses unpkg to perfectly match your installed npm version. 
// Note the .mjs extension which is required for pdfjs-dist version 4+
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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

                // --- NEW UNIFIED PDF LOGIC ---
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const page = await pdf.getPage(1); // Reads the first page

                // 1. Render the PDF to a hidden Canvas (2x scale for crystal clear OCR)
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                if (context) {
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport } as any).promise;

                    // 2. Convert that Canvas into a Base64 JPEG
                    const base64Image = canvas.toDataURL('image/jpeg', 0.9);

                    // 3. Send it to your Cloud Vision backend just like a normal photo!
                    const result = await scanSmartInvoice({ imageBase64: base64Image });
                    const data = result.data as { success: boolean, text: string };

                    console.log("RAW CLOUD VISION PDF OUTPUT:\n", data.text);

                    if (data.text) {
                        extractedData = parseRawText(data.text);
                    }
                } else {
                    throw new Error("Canvas context failed to initialize.");
                }
            } else if (file.type.startsWith('image/')) {

                // --- NEW CLOUD VISION LOGIC ---

                // 1. Convert the image to base64
                const base64Image = await fileToBase64(file);

                // 2. Send it to your deployed Firebase Function
                const result = await scanSmartInvoice({ imageBase64: base64Image });
                const data = result.data as { success: boolean, text: string };

                // 3. Debugging Logs (Keep your console open!)
                console.log("RAW CLOUD VISION OUTPUT:\n", data.text);

                // 4. Parse the returned text using your Regex utility
                if (data.text) {
                    extractedData = parseRawText(data.text);
                    console.log("PARSED DATA ARRAY:", extractedData);
                }

                // ------------------------------

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