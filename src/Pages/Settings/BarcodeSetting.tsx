import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { FiCheck } from 'react-icons/fi';
import { InfoTooltip } from '../../Components/InfoToolTip';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BarcodeFormat = 'qr_only' | 'barcode_only' | 'both';

export interface BarcodeSettings {
    settingType: 'barcode';
    labelFormat?: BarcodeFormat;
    showMrpOnLabel?: boolean;
    showProductNameOnLabel?: boolean;
    showShopNameOnLabel?: boolean;
    showBarcodeNumber?: boolean;
    showAddressOnLabel?: boolean;   
    showPhoneOnLabel?: boolean;     
    companyId?: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const getDefaultBarcodeSettings = (companyId: string): BarcodeSettings => ({
    companyId,
    settingType: 'barcode',
    labelFormat: 'both',
    showMrpOnLabel: true,
    showProductNameOnLabel: true,
    showShopNameOnLabel: true,
    showBarcodeNumber: true,
     showAddressOnLabel: true, 
    showPhoneOnLabel: true,     
});

// ─── Realistic SVG components (matching PrintQR visual style) ─────────────────

/** Barcode SVG — matches PrintQR's JsBarcode CODE128 output style */
const BarcodeSvg: React.FC<{ width?: number; height?: number }> = ({ width = 88, height = 28 }) => (
    <svg width={width} height={height} viewBox="0 0 88 28" fill="none">
        {/* Guard bars + data bars mimicking CODE128 */}
        {[0,2,4,7,9,11,14,16,19,21,24,26,29,31,34,36,39,41,44,46,49,51,54,56,59,61,64,66,69,71,74,76,79,81,84,86].map((x, i) => (
            <rect key={i} x={x} y="0" width={i % 5 === 0 ? 2.5 : i % 3 === 0 ? 1.5 : 1} height="22" fill="#1e293b" />
        ))}
        <text x="44" y="27" textAnchor="middle" fontSize="4.5" fill="#64748b" fontFamily="monospace" letterSpacing="0.5">8 90123 45678 9</text>
    </svg>
);

/** QR SVG — mimics a real QR code with finder patterns + data modules */
const QRSvg: React.FC<{ size?: number }> = ({ size = 56 }) => {
    const cell = size / 14;
    // Data module pattern (simplified but realistic looking)
    const dataModules = [
        [3,3],[3,4],[4,3],[5,3],[5,5],[3,5],
        [7,7],[7,8],[7,9],[8,7],[9,7],[9,9],[8,9],
        [7,3],[7,4],[8,3],[9,3],[9,5],[7,5],[8,5],
        [3,7],[3,8],[4,7],[5,7],[5,9],[3,9],[4,9],
        [10,3],[10,5],[11,3],[12,3],[12,4],[12,5],
        [10,7],[10,8],[11,9],[12,7],[12,9],
        [10,10],[10,12],[11,11],[12,10],[12,12],
        [3,10],[4,12],[5,10],[5,12],[4,11],
        [7,10],[7,12],[8,11],[9,10],[9,11],[9,12],
    ];
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
            {/* Top-left finder */}
            <rect x={0} y={0} width={cell*7} height={cell*7} rx="1" stroke="#1e293b" strokeWidth="1.5" fill="none"/>
            <rect x={cell*2} y={cell*2} width={cell*3} height={cell*3} rx="0.5" fill="#1e293b"/>
            {/* Top-right finder */}
            <rect x={cell*7} y={0} width={cell*7} height={cell*7} rx="1" stroke="#1e293b" strokeWidth="1.5" fill="none"/>
            <rect x={cell*9} y={cell*2} width={cell*3} height={cell*3} rx="0.5" fill="#1e293b"/>
            {/* Bottom-left finder */}
            <rect x={0} y={cell*7} width={cell*7} height={cell*7} rx="1" stroke="#1e293b" strokeWidth="1.5" fill="none"/>
            <rect x={cell*2} y={cell*9} width={cell*3} height={cell*3} rx="0.5" fill="#1e293b"/>
            {/* Data modules */}
            {dataModules.map(([col, row], i) => (
                <rect key={i} x={col * cell} y={row * cell} width={cell - 0.5} height={cell - 0.5} fill="#1e293b" rx="0.2"/>
            ))}
        </svg>
    );
};

// ─── Realistic 35×35mm Label Preview (matches PrintQR print output) ───────────

interface LabelCardProps {
    format: BarcodeFormat;
    settings: BarcodeSettings;
    companyName?: string;
    scale?: number; // CSS scale multiplier for display
}

const LabelCard: React.FC<LabelCardProps> = ({
    format,
    settings,
    companyName = 'RAKSHAAA MART',
    scale = 1,
}) => {
    const px = 132 * scale;
    const isBoth = format === 'both';
 
    // For "both": QR on LEFT, rotated barcode on RIGHT, same visual height
    const qrSize = 44 * scale;
    // Barcode SVG natural dims: barcodeW wide × barcodeH tall.
    // After 90° rotation: visually barcodeH wide × barcodeW tall.
    // We want visual height = qrSize, so barcodeW = qrSize.
    const barcodeNaturalW = qrSize;        // becomes visual height after rotation
    const barcodeNaturalH = qrSize * 0.42; // becomes visual width after rotation
    // Container matches the visual footprint of the rotated barcode
    const rotatedContainerW = barcodeNaturalH;
    const rotatedContainerH = barcodeNaturalW;
    return (
        <div
            style={{
                width: px,
                height: px,
                border: '1px dashed #94a3b8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${4 * scale}px`,
                fontFamily: 'sans-serif',
                background: '#fff',
                boxSizing: 'border-box',
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            {/* Company name */}
{settings.showShopNameOnLabel && (
    <p style={{ fontSize: 7 * scale, fontWeight: 'bold', margin: 0, textAlign: 'center', color: '#0f172a', letterSpacing: '0.04em', lineHeight: 1.2 }}>
        {companyName}
    </p>
)}

{/* Address & Phone row — NEW */}
{(settings.showAddressOnLabel || settings.showPhoneOnLabel) && (
    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 * scale }}>
        {settings.showAddressOnLabel && (
            <p style={{ fontSize: 4 * scale, margin: 0, color: '#475569', textAlign: 'left', lineHeight: 1.2, flex: 1 }}>
                123, Main St
            </p>
        )}
        {settings.showPhoneOnLabel && (
            <p style={{ fontSize: 4 * scale, margin: 0, color: '#475569', textAlign: 'right', lineHeight: 1.2 }}>
                9876543210
            </p>
        )}
    </div>
)}

            {/* Code area */}
            {isBoth ? (
                /* "both" layout: QR LEFT, rotated barcode RIGHT, same height */
                <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    width: '100%',
                    gap: 6 * scale,
                }}>
                    {/* QR on the LEFT */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <QRSvg size={qrSize} />
                    </div>
 
                    {/* Rotated barcode on the RIGHT — visual height = qrSize */}
                    <div style={{
                        width: rotatedContainerW,
                        height: rotatedContainerH,
                        position: 'relative',
                        flexShrink: 0,
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: `translate(-50%, -50%) rotate(90deg)`,
                            width: barcodeNaturalW,
                            height: barcodeNaturalH,
                        }}>
                            <BarcodeSvg width={barcodeNaturalW} height={barcodeNaturalH} />
                        </div>
                    </div>
                </div>
            ) : (
                /* Single-code layout: centered column */
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    width: '100%',
                }}>
                    {(format === 'barcode_only') && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <BarcodeSvg width={80 * scale} height={24 * scale} />
                        </div>
                    )}
                    {(format === 'qr_only') && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <QRSvg size={qrSize} />
                        </div>
                    )}
                </div>
            )}
 
            {/* Footer info */}
            <div style={{ width: '100%', textAlign: 'center' }}>
                {settings.showBarcodeNumber && (
                    <p style={{ fontSize: 4.5 * scale, margin: 0, color: '#475569', fontFamily: 'monospace' }}>
                        8901234567890
                    </p>
                )}
                {settings.showProductNameOnLabel && (
                    <p style={{ fontSize: 6 * scale, fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
                        Fresh Apple (1 kg)
                    </p>
                )}
                {settings.showMrpOnLabel && (
                    <p style={{ fontSize: 7 * scale, fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
                        MRP: ₹100
                    </p>
                )}
            </div>
        </div>
    );
};

// ─── Option config ─────────────────────────────────────────────────────────────

interface FormatOption {
    id: BarcodeFormat;
    title: string;
    subtitle: string;
    recommended?: boolean;
    pros: string[];
    con?: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
    {
        id: 'qr_only',
        title: 'QR Code Only',
        subtitle: '35 × 35 mm',
        pros: ['Works on all phones', 'Camera-friendly', 'Clean look'],
        con: 'No barcode for legacy scanners',
    },
    {
        id: 'barcode_only',
        title: 'Barcode Only',
        subtitle: '35 × 35 mm',
        pros: ['Works on all scanners', 'Classic retail format', 'Fast at checkout'],
        con: 'No QR for mobile users',
    },
    {
        id: 'both',
        title: 'Barcode + QR',
        subtitle: '35 × 35 mm',
        recommended: false,
        pros: ['Best scan reliability', 'Works on all devices', 'Future-proof'],
    },
];

// ─── Main Component ────────────────────────────────────────────────────────────

const BarcodeSetting: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<BarcodeSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    // ── Fetch ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!currentUser?.companyId) { setIsLoading(true); return; }

        const fetchOrCreate = async () => {
            setIsLoading(true);
            const companyId = currentUser.companyId!;
            const ref = doc(db, 'companies', companyId, 'settings', 'barcode-settings');
            try {
                const snap = await getDoc(ref);
                let data = getDefaultBarcodeSettings(companyId);
                if (snap.exists()) {
                    data = { ...data, ...snap.data() } as BarcodeSettings;
                } else {
                    await setDoc(ref, data);
                }
                setSettings(data);
            } catch (err) {
                console.error('Failed to fetch barcode settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrCreate();
    }, [currentUser?.companyId]);

    // ── Save ───────────────────────────────────────────────────────────────────
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser?.companyId || !settings) {
            setModal({ message: 'Error: Missing data.', type: State.ERROR }); return;
        }
        setIsSaving(true);
        try {
            const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'barcode-settings');
            await setDoc(ref, { ...settings, updatedAt: new Date() }, { merge: true });
            setModal({ message: 'Barcode settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save barcode settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (field: keyof BarcodeSettings, value: any) => {
        if (!settings) return;
        setSettings({ ...settings, [field]: value });
    };

    const handleCheckboxChange = (field: keyof BarcodeSettings, checked: boolean) => {
        if (settings) setSettings({ ...settings, [field]: checked });
    };

    // ── Loading ────────────────────────────────────────────────────────────────
    if (isLoading || !settings) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center">
                <Spinner />
                <p className="mt-4 text-gray-600">Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-white w-full">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* ── Top Bar ── */}
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
                <button
                    onClick={() => navigate(-1)}
                    className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1"
                >
                    &times;
                </button>
                <h1 className="text-lg font-semibold text-gray-800">Barcode / Label Settings</h1>
                <div className="w-6" />
            </div>

            <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border pb-30">
                <form onSubmit={handleSave} className="max-w-3xl mx-auto">

                    {/* ── Card 1: Label Format ── */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-semibold text-gray-800">Label Format</h2>
                            <ResetSettingsButton<BarcodeSettings>
                                defaults={getDefaultBarcodeSettings(currentUser?.companyId ?? '')}
                                onReset={setSettings}
                            />
                        </div>
                        <p className="text-sm text-gray-500 mb-4">
                            Choose the code type printed on product labels. All labels print at <strong>35 × 35 mm</strong>.
                        </p>

                        {/* 3-column option grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                            {FORMAT_OPTIONS.map((opt) => {
                                const isSelected = settings.labelFormat === opt.id;
                                return (
                                    <div
                                        key={opt.id}
                                        onClick={() => handleChange('labelFormat', opt.id)}
                                        className={`relative cursor-pointer rounded-xl border-2 p-4 flex flex-col items-center gap-3 transition-all duration-200
                                            ${isSelected
                                                ? 'border-sky-500 bg-sky-50 shadow-md'
                                                : 'border-gray-200 hover:border-sky-300 bg-white'
                                            }`}
                                    >
                                        {/* Recommended badge */}
                                        {opt.recommended && (
                                            <span className="absolute -top-3 right-3 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full">
                                                ⭐ Recommended
                                            </span>
                                        )}

                                        {/* Check indicator */}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 bg-sky-500 text-white rounded-full p-0.5 shadow-sm z-10">
                                                <FiCheck size={12} />
                                            </div>
                                        )}

                                        {/* Realistic label preview at 0.9x scale */}
                                        <div className={`rounded border p-1.5 transition-colors ${isSelected ? 'border-sky-200 bg-sky-50' : 'border-gray-200 bg-gray-50'}`}>
                                            <LabelCard
                                                format={opt.id}
                                                settings={settings}
                                                scale={0.88}
                                            />
                                        </div>

                                        {/* Title & size */}
                                        <div className="text-center w-full">
                                            <p className="font-bold text-gray-800 text-sm">{opt.title}</p>
                                            <p className="text-xs text-gray-400">{opt.subtitle}</p>
                                        </div>

                                        {/* Pros / con */}
                                        <div className="flex flex-col gap-1 w-full">
                                            {opt.pros.map((p) => (
                                                <span key={p} className="text-xs text-emerald-600 font-medium">✓ {p}</span>
                                            ))}
                                            {opt.con && (
                                                <span className="text-xs text-red-400 font-medium">✗ {opt.con}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Live preview — bigger scale so user can inspect */}
                        <div>
                            <div className="flex items-center mb-3">
                                <p className="text-sm font-medium text-gray-700 mr-2">Label Preview (actual proportions)</p>
                                <InfoTooltip text="This preview reflects exactly how the printed 35×35mm label will look." />
                            </div>
                            <div className="flex items-center gap-4">
                                <LabelCard
                                    format={settings.labelFormat ?? 'both'}
                                    settings={settings}
                                    scale={1.4}
                                />
                                <div className="text-xs text-gray-500 leading-relaxed">
                                    <p className="font-semibold text-gray-700 mb-1">Physical size</p>
                                    <p>35 mm × 35 mm</p>
                                    <p className="mt-2 font-semibold text-gray-700">Format</p>
                                    <p>{FORMAT_OPTIONS.find(o => o.id === settings.labelFormat)?.title}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Card 2: Label Content ── */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-1">Label Content</h2>
                        <p className="text-sm text-gray-500 mb-4">Choose what information is printed on each label. Changes reflect instantly in the preview above.</p>

                        <div className="flex items-center mb-4">
                            <input
                                type="checkbox"
                                id="show-shop-name"
                                checked={settings.showShopNameOnLabel ?? true}
                                onChange={(e) => handleCheckboxChange('showShopNameOnLabel', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                            />
                            <label htmlFor="show-shop-name" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Show Shop Name on Label
                            </label>
                            <InfoTooltip text="Prints your store name at the top of every product label." />
                        </div>

                        <div className="flex items-center mb-4">
                            <input
                                type="checkbox"
                                id="show-barcode-number"
                                checked={settings.showBarcodeNumber ?? true}
                                onChange={(e) => handleCheckboxChange('showBarcodeNumber', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                            />
                            <label htmlFor="show-barcode-number" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Show Barcode Number
                            </label>
                            <InfoTooltip text="Prints the numeric barcode value below the codes for manual lookup." />
                        </div>

                        <div className="flex items-center mb-4">
                            <input
                                type="checkbox"
                                id="show-product-name"
                                checked={settings.showProductNameOnLabel ?? true}
                                onChange={(e) => handleCheckboxChange('showProductNameOnLabel', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                            />
                            <label htmlFor="show-product-name" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Show Product Name on Label
                            </label>
                            <InfoTooltip text="Prints the item name on the label." />
                        </div>

                        <div className="flex items-center mb-4">
                            <input
                                type="checkbox"
                                id="show-mrp"
                                checked={settings.showMrpOnLabel ?? true}
                                onChange={(e) => handleCheckboxChange('showMrpOnLabel', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                            />
                            <label htmlFor="show-mrp" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Show MRP on Label
                            </label>
                            <InfoTooltip text="Prints the Maximum Retail Price on the label." />
                        </div>
                        {/* Show Address */}
<div className="flex items-center mb-4">
    <input
        type="checkbox"
        id="show-address"
        checked={settings.showAddressOnLabel ?? true}
        onChange={(e) => handleCheckboxChange('showAddressOnLabel', e.target.checked)}
        className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
    />
    <label htmlFor="show-address" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
        Show Address on Label
    </label>
    <InfoTooltip text="Prints your business address on the label." />
</div>

{/* Show Phone */}
<div className="flex items-center mb-4">
    <input
        type="checkbox"
        id="show-phone"
        checked={settings.showPhoneOnLabel ?? true}
        onChange={(e) => handleCheckboxChange('showPhoneOnLabel', e.target.checked)}
        className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
    />
    <label htmlFor="show-phone" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
        Show Phone Number on Label
    </label>
    <InfoTooltip text="Prints your business phone number on the label." />
</div>
                    </div>

                </form>
            </main>

            {/* ── Sticky Save Button ── */}
            <div className="fixed bottom-15 left-0 right-0 p-4 bg-transparent shadow-md">
                <div className="max-w-3xl mx-auto flex justify-center gap-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="w-auto min-w-[150px] flex items-center justify-center bg-sky-500 text-white font-bold py-3 px-6 rounded-sm hover:bg-sky-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
                    >
                        {isSaving ? <Spinner /> : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BarcodeSetting;