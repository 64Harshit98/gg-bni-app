// src/UseComponents/BarcodeScanner.tsx

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
    Html5Qrcode,
    Html5QrcodeScannerState,
    Html5QrcodeSupportedFormats,
    type Html5QrcodeResult,
} from 'html5-qrcode';

/**
 * What the parent tells the scanner about a scanned code. Only used in
 * `continuous` mode to fill the running list inside the camera overlay.
 * Returning nothing counts as "added" with the raw code as the label.
 */
export type ScanOutcome =
    | { status: 'added'; label: string }
    | { status: 'not_found' | 'error'; message: string };

interface BarcodeScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onScanSuccess: (decodedText: string) => ScanOutcome | void | Promise<ScanOutcome | void>;
    /**
     * Keep the camera open after a successful scan so many items can be scanned
     * in one go. The parent closes the scanner (via `isOpen`) when the user taps
     * Done. Default false: stop after the first scan.
     */
    continuous?: boolean;
    qrboxWidth?: number;
    qrboxHeight?: number;
}

interface ScanLogEntry {
    code: string;
    ok: boolean;
    text: string;
    count: number;
}

// Only what we actually scan: our own printed labels (QR / CODE_128) and retail
// barcodes (EAN / UPC). Every extra format is tried on every frame by ZXing.
const FORMATS = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
];

// Wait between decode attempts. The library adds this AFTER each decode
// finishes, so 25 fps = 40ms idle instead of the previous 100ms.
const FPS = 25;
// 1D codes must be read this many times (within CONFIRM_WINDOW_MS) before they
// are accepted. Cuts misreads like an EAN-13 partially read as a UPC-E. QR has
// strong error correction, so it is accepted on the first read.
const CONFIRM_READS = 2;
const CONFIRM_WINDOW_MS = 900;
// Continuous mode: the same code is not added again until it has been out of
// view for this long, and at least REPEAT_MIN_MS has passed. Prevents one
// barcode held in front of the camera from being added on every frame.
const REPEAT_GAP_MS = 1000;
const REPEAT_MIN_MS = 1500;

const safeStop = async (scanner: Html5Qrcode) => {
    try {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
            await scanner.stop();
        }
    } catch (err) {
        console.error('Failed to stop scanner cleanly:', err);
    }
    try {
        scanner.clear();
    } catch {
        /* element already gone */
    }
};

let audioCtx: AudioContext | null = null;
const beep = (ok: boolean) => {
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        audioCtx = audioCtx || new Ctx();
        const ctx = audioCtx!;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = ok ? 1800 : 400;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (ok ? 0.08 : 0.2));
    } catch {
        /* audio not available */
    }
    try {
        navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
    } catch {
        /* vibrate not available */
    }
};

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
    isOpen,
    onClose,
    onScanSuccess,
    continuous = false,
    qrboxWidth,
    qrboxHeight,
}) => {
    const containerId = 'barcode-scanner-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [log, setLog] = useState<ScanLogEntry[]>([]);
    const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
    const [torchSupported, setTorchSupported] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
    const [zoomed, setZoomed] = useState(false);

    // The parent's handler is a new function on every render. Keep it in a ref
    // so the camera effect does NOT restart every time the parent re-renders
    // (which is what happened before: each cart update stopped and restarted
    // the camera, which is slow and loses focus).
    const onScanRef = useRef(onScanSuccess);
    onScanRef.current = onScanSuccess;
    const continuousRef = useRef(continuous);
    continuousRef.current = continuous;

    const scannerRef = useRef<Html5Qrcode | null>(null);
    // Serialises start/stop so a quick close+reopen (or React StrictMode's
    // double effect) never has two camera sessions on the same element.
    const lifecycleRef = useRef<Promise<void>>(Promise.resolve());

    const totalScanned = log.reduce((sum, e) => sum + (e.ok ? e.count : 0), 0);

    const flashFor = useCallback((kind: 'ok' | 'bad') => {
        setFlash(kind);
        window.setTimeout(() => setFlash(null), 250);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;
        setErrorMessage(null);
        setLog([]);
        setTorchOn(false);
        setTorchSupported(false);
        setZoomRange(null);
        setZoomed(false);

        // Per-session decode state
        let candidate: { code: string; reads: number; firstAt: number } | null = null;
        let lastAccepted: { code: string; acceptedAt: number; lastSeenAt: number } | null = null;
        let busy = false;
        let finished = false;

        const accept = async (code: string) => {
            busy = true;
            try {
                let outcome: ScanOutcome | void;
                try {
                    outcome = await onScanRef.current(code);
                } catch (err) {
                    console.error('Scan handler failed:', err);
                    outcome = { status: 'error', message: 'Scan error occurred.' };
                }
                if (cancelled || !continuousRef.current) return;

                const ok = !outcome || outcome.status === 'added';
                const text = !outcome ? code : outcome.status === 'added' ? outcome.label : outcome.message;
                beep(ok);
                flashFor(ok ? 'ok' : 'bad');
                setLog(prev => {
                    const idx = prev.findIndex(e => e.code === code && e.ok === ok);
                    if (idx >= 0 && ok) {
                        const updated = { ...prev[idx], text, count: prev[idx].count + 1 };
                        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
                    }
                    return [{ code, ok, text, count: 1 }, ...prev.filter((_, i) => i !== idx)].slice(0, 50);
                });
            } finally {
                busy = false;
            }
        };

        const onDecoded = (decodedText: string, result: Html5QrcodeResult) => {
            if (cancelled || finished) return;
            const code = decodedText.trim();
            if (!code) return;
            const now = Date.now();

            // Continuous: same code still in view → just refresh "last seen"
            if (lastAccepted && lastAccepted.code === code) {
                const outOfViewLongEnough = now - lastAccepted.lastSeenAt > REPEAT_GAP_MS;
                const cooledDown = now - lastAccepted.acceptedAt > REPEAT_MIN_MS;
                lastAccepted.lastSeenAt = now;
                if (!(outOfViewLongEnough && cooledDown)) return;
            }
            if (busy) return;

            // Confirmation for 1D barcodes
            const isQr = result?.result?.format?.format === Html5QrcodeSupportedFormats.QR_CODE;
            if (!isQr) {
                if (!candidate || candidate.code !== code || now - candidate.firstAt > CONFIRM_WINDOW_MS) {
                    candidate = { code, reads: 1, firstAt: now };
                } else {
                    candidate.reads += 1;
                }
                if (candidate.reads < CONFIRM_READS) return;
            }
            candidate = null;

            if (!continuousRef.current) {
                // Single-shot: hand the code over once; parent closes us.
                finished = true;
                beep(true);
                void onScanRef.current(code);
                return;
            }

            lastAccepted = { code, acceptedAt: now, lastSeenAt: now };
            void accept(code);
        };

        const qrbox = qrboxWidth && qrboxHeight
            ? { width: qrboxWidth, height: qrboxHeight }
            // Wide, short box: 1D barcodes are wide, and the library decodes a
            // canvas the size of this box, so width = more pixels per bar.
            : (vw: number, vh: number) => {
                const width = Math.max(120, Math.floor(Math.min(vw * 0.9, 520)));
                const height = Math.max(80, Math.floor(Math.min(vh * 0.7, width * 0.6)));
                return { width, height };
            };

        const scanConfig = {
            fps: FPS,
            qrbox,
            // Camera images are never mirrored, so skip the second (flipped)
            // decode attempt the library otherwise makes on every frame.
            disableFlip: true,
        };

        const afterStart = async (scanner: Html5Qrcode) => {
            // Continuous autofocus where the browser exposes it (mostly Android Chrome).
            try {
                const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
                if (caps.focusMode?.includes('continuous')) {
                    // focusMode isn't in TS's MediaTrackConstraintSet yet
                    await scanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
                }
            } catch {
                /* not supported */
            }
            try {
                const camCaps = scanner.getRunningTrackCameraCapabilities();
                if (!cancelled) setTorchSupported(camCaps.torchFeature().isSupported());
                const zoom = camCaps.zoomFeature();
                if (!cancelled && zoom.isSupported() && zoom.max() > zoom.min()) {
                    setZoomRange({ min: zoom.min(), max: zoom.max() });
                }
            } catch {
                /* not supported */
            }
        };

        const start = async () => {
            if (cancelled) return;
            const scanner = new Html5Qrcode(containerId, {
                verbose: false,
                formatsToSupport: FORMATS,
                // Native BarcodeDetector (Android Chrome) is far faster than the
                // JS ZXing decoder; falls back to ZXing elsewhere (e.g. iOS).
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            });
            scannerRef.current = scanner;
            try {
                await scanner.start(
                    { facingMode: 'environment' },
                    {
                        ...scanConfig,
                        // Ask for a sharp HD stream from the rear camera. `ideal`
                        // never fails; devices without it give what they have.
                        videoConstraints: {
                            facingMode: { ideal: 'environment' },
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                        },
                    },
                    onDecoded,
                    undefined
                );
            } catch (err) {
                console.error('Rear camera start failed, trying any camera:', err);
                if (cancelled) return;
                try {
                    await scanner.start({}, scanConfig, onDecoded, undefined);
                } catch (fallbackErr) {
                    console.error('Fallback camera start also failed.', fallbackErr);
                    if (!cancelled) setErrorMessage('Failed to start any camera. Please check permissions.');
                    return;
                }
            }
            if (!cancelled) await afterStart(scanner);
        };

        const run = lifecycleRef.current.then(start).catch(err => console.error(err));

        return () => {
            cancelled = true;
            lifecycleRef.current = run.then(async () => {
                const scanner = scannerRef.current;
                scannerRef.current = null;
                if (scanner) await safeStop(scanner);
            });
        };
    }, [isOpen, containerId, qrboxWidth, qrboxHeight, flashFor]);

    const toggleTorch = async () => {
        const scanner = scannerRef.current;
        if (!scanner) return;
        try {
            await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(!torchOn);
            setTorchOn(v => !v);
        } catch (err) {
            console.error('Torch toggle failed:', err);
        }
    };

    const toggleZoom = async () => {
        const scanner = scannerRef.current;
        if (!scanner || !zoomRange) return;
        try {
            // 2x lets the phone stay far enough away to focus on small printed labels.
            const target = zoomed ? zoomRange.min : Math.min(zoomRange.max, Math.max(zoomRange.min, 2));
            await scanner.getRunningTrackCameraCapabilities().zoomFeature().apply(target);
            setZoomed(v => !v);
        } catch (err) {
            console.error('Zoom toggle failed:', err);
        }
    };

    if (!isOpen) {
        return null;
    }

    const flashRing = flash === 'ok' ? 'ring-4 ring-green-400' : flash === 'bad' ? 'ring-4 ring-red-500' : 'ring-0';

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-md flex items-center justify-between text-white mb-3">
                <p className="text-sm font-semibold">
                    {continuous
                        ? totalScanned > 0
                            ? `${totalScanned} item${totalScanned === 1 ? '' : 's'} scanned`
                            : 'Scan items one after another'
                        : 'Point the camera at a barcode'}
                </p>
                <div className="flex gap-2">
                    {zoomRange && (
                        <button
                            type="button"
                            onClick={toggleZoom}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full border ${zoomed ? 'bg-white text-black border-white' : 'border-white/60 text-white'}`}
                            aria-pressed={zoomed}
                            aria-label="Toggle zoom"
                        >
                            2x
                        </button>
                    )}
                    {torchSupported && (
                        <button
                            type="button"
                            onClick={toggleTorch}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full border ${torchOn ? 'bg-yellow-300 text-black border-yellow-300' : 'border-white/60 text-white'}`}
                            aria-pressed={torchOn}
                            aria-label="Toggle flashlight"
                        >
                            Light
                        </button>
                    )}
                </div>
            </div>

            {errorMessage && (
                <p className="w-full max-w-md text-center text-red-200 bg-red-900/60 p-2 rounded mb-3 text-sm">{errorMessage}</p>
            )}

            <div
                id={containerId}
                className={`w-full max-w-md bg-gray-900 rounded-lg overflow-hidden transition-shadow ${flashRing}`}
            ></div>

            {continuous && log.length > 0 && (
                <ul className="w-full max-w-md mt-3 flex-1 min-h-0 overflow-y-auto space-y-1.5" aria-live="polite">
                    {log.map(entry => (
                        <li
                            key={`${entry.ok ? 'ok' : 'bad'}-${entry.code}`}
                            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${entry.ok ? 'bg-white/10 text-white' : 'bg-red-900/50 text-red-100'}`}
                        >
                            <span className="truncate mr-2">{entry.text}</span>
                            {entry.ok && <span className="shrink-0 font-bold">×{entry.count}</span>}
                        </li>
                    ))}
                </ul>
            )}

            <button
                type="button"
                onClick={onClose}
                className={`mt-4 font-bold py-3 px-6 rounded-lg shadow-lg transition w-full max-w-md ${continuous && totalScanned > 0 ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-white text-gray-800 hover:bg-gray-200'}`}
            >
                {continuous ? (totalScanned > 0 ? `Done (${totalScanned})` : 'Close') : 'Close Scanner'}
            </button>
        </div>
    );
};

export default BarcodeScanner;
