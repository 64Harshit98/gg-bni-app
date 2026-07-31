// src/components/BarcodeScanner.tsx

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onScanSuccess: (decodedText: string) => void;
    qrboxWidth?: number;
    qrboxHeight?: number;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
    isOpen,
    onClose,
    onScanSuccess,
    qrboxWidth = 300,
    qrboxHeight = 300
}) => {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const scannerContainerId = 'barcode-scanner-container';
    // State to hold any potential error messages
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (!scannerRef.current) {
                console.log("Initializing Barcode Scanner with advanced config...");
                // ✅ 1. Add experimental features for better 1D barcode detection
                const config = {
                    verbose: false,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.QR_CODE,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.ITF,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.CODE_93,
                        Html5QrcodeSupportedFormats.CODABAR,
                        Html5QrcodeSupportedFormats.PDF_417,
                        Html5QrcodeSupportedFormats.DATA_MATRIX,
                        Html5QrcodeSupportedFormats.AZTEC,
                        Html5QrcodeSupportedFormats.RSS_14,
                        Html5QrcodeSupportedFormats.RSS_EXPANDED,
                        Html5QrcodeSupportedFormats.MAXICODE,
                        Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
                    ],
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true,
                    },
                };
                scannerRef.current = new Html5Qrcode(scannerContainerId, config);
            }

            const scanner = scannerRef.current;

            const startScanner = async () => {
                try {
                    setErrorMessage(null); // Clear previous errors
                    if (scanner && !scanner.isScanning) {
                        await scanner.start(
                            { facingMode: "environment" }, // Prioritize the rear camera
                            {
                                fps: 10,
                                qrbox: { width: qrboxWidth, height: qrboxHeight }
                            },
                            (decodedText) => {
                                // Prevent multiple rapid scans
                                if (scanner.isScanning) {
                                    scanner.stop();
                                    console.log(decodedText, "clg")
                                    onScanSuccess(decodedText);
                                }
                            },
                            undefined
                        );
                    }
                } catch (err) {
                    console.error("Primary camera (environment) start failed:", err, "Trying fallback.");
                    // ✅ 2. Provide user feedback on camera failure and try a fallback
                    setErrorMessage("Rear camera not found. Trying other cameras...");
                    try {
                        if (scanner && !scanner.isScanning) {
                            await scanner.start(
                                {}, // Fallback to any available camera
                                { fps: 10, qrbox: { width: qrboxWidth, height: qrboxHeight } },
                                (decodedText) => {
                                    if (scanner.isScanning) {
                                        scanner.stop();
                                        onScanSuccess(decodedText);
                                    }
                                },
                                undefined
                            );
                            setErrorMessage(null); // Clear error message on fallback success
                        }
                    } catch (fallbackErr) {
                        console.error("Fallback camera start also failed.", fallbackErr);
                        setErrorMessage("Failed to start any camera. Please check permissions.");
                    }
                }
            };

            startScanner();
        }

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop()
                    .catch((err) => {
                        console.error("Failed to stop scanner cleanly:", err);
                    });
            }
        };
    }, [isOpen, onScanSuccess, qrboxWidth, qrboxHeight]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4">
            {/* ✅ 3. Display the error message to the user */}
            {errorMessage && <p className="absolute top-5 text-center text-red-400 bg-red-900 bg-opacity-50 p-2 rounded">{errorMessage}</p>}
            <div id={scannerContainerId} className="w-full max-w-md bg-gray-900 rounded-lg overflow-hidden"></div>
            <button
                onClick={onClose}
                className="mt-4 bg-card text-foreground font-bold py-2 px-6 rounded-lg shadow-lg hover:bg-muted transition"
            >
                Close Scanner
            </button>
        </div>
    );
};

export default BarcodeScanner;

