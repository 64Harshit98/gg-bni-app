import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import {
    FiCheck,
    FiX,
    FiChevronLeft,
    FiGrid,
    FiList,
    FiHome,
    FiMapPin,
    FiPhone,
    FiHash,
    FiTag,
    FiFileText,
} from 'react-icons/fi';
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
        {[0, 2, 4, 7, 9, 11, 14, 16, 19, 21, 24, 26, 29, 31, 34, 36, 39, 41, 44, 46, 49, 51, 54, 56, 59, 61, 64, 66, 69, 71, 74, 76, 79, 81, 84, 86].map((x, i) => (
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
        [3, 3], [3, 4], [4, 3], [5, 3], [5, 5], [3, 5],
        [7, 7], [7, 8], [7, 9], [8, 7], [9, 7], [9, 9], [8, 9],
        [7, 3], [7, 4], [8, 3], [9, 3], [9, 5], [7, 5], [8, 5],
        [3, 7], [3, 8], [4, 7], [5, 7], [5, 9], [3, 9], [4, 9],
        [10, 3], [10, 5], [11, 3], [12, 3], [12, 4], [12, 5],
        [10, 7], [10, 8], [11, 9], [12, 7], [12, 9],
        [10, 10], [10, 12], [11, 11], [12, 10], [12, 12],
        [3, 10], [4, 12], [5, 10], [5, 12], [4, 11],
        [7, 10], [7, 12], [8, 11], [9, 10], [9, 11], [9, 12],
    ];
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
            {/* Top-left finder */}
            <rect x={0} y={0} width={cell * 7} height={cell * 7} rx="1" stroke="#1e293b" strokeWidth="1.5" fill="none" />
            <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} rx="0.5" fill="#1e293b" />
            {/* Top-right finder */}
            <rect x={cell * 7} y={0} width={cell * 7} height={cell * 7} rx="1" stroke="#1e293b" strokeWidth="1.5" fill="none" />
            <rect x={cell * 9} y={cell * 2} width={cell * 3} height={cell * 3} rx="0.5" fill="#1e293b" />
            {/* Bottom-left finder */}
            <rect x={0} y={cell * 7} width={cell * 7} height={cell * 7} rx="1" stroke="#1e293b" strokeWidth="1.5" fill="none" />
            <rect x={cell * 2} y={cell * 9} width={cell * 3} height={cell * 3} rx="0.5" fill="#1e293b" />
            {/* Data modules */}
            {dataModules.map(([col, row], i) => (
                <rect key={i} x={col * cell} y={row * cell} width={cell - 0.5} height={cell - 0.5} fill="#1e293b" rx="0.2" />
            ))}
        </svg>
    );
};

// ─── Realistic 35×35mm Label Preview (matches PrintQR print output) ───────────

const LABEL_PX = 132; // 35 mm @ 96dpi

interface LabelCardProps {
    format: BarcodeFormat;
    settings: BarcodeSettings;
    companyName?: string;
    scale?: number; // CSS scale multiplier for display
}

const LabelCard: React.FC<LabelCardProps> = ({
    format,
    settings,
    companyName,
    scale = 1,
}) => {
    const isBoth = format === 'both';
    const qrSize = 44;
    const barcodeNaturalW = qrSize;        // becomes visual height after rotation
    const barcodeNaturalH = qrSize * 0.42; // becomes visual width after rotation
    const rotatedContainerW = barcodeNaturalH;
    const rotatedContainerH = barcodeNaturalW;

    return (
        // Outer box = scaled footprint (for layout)
        <div style={{ width: LABEL_PX * scale, height: LABEL_PX * scale, flexShrink: 0 }}>
            {/* Inner box = always real 132px, only transform scales it */}
            <div
                style={{
                    width: LABEL_PX,
                    height: LABEL_PX,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    border: '1px dashed #9aa3b5',
                    borderRadius: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 4,
                    fontFamily: 'sans-serif',
                    background: '#fff',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                }}
            >
                {/* Company name (from DB) */}
                {settings.showShopNameOnLabel && (
                    <p style={{ fontSize: 7, fontWeight: 'bold', margin: 0, textAlign: 'center', color: '#0f172a', letterSpacing: '0.04em', lineHeight: 1.2 }}>
                        {companyName || 'Your Shop Name'}
                    </p>
                )}

                {/* Address & Phone row */}
                {(settings.showAddressOnLabel || settings.showPhoneOnLabel) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                        {settings.showAddressOnLabel && (
                            <p style={{ fontSize: 4, margin: 0, color: '#475569', textAlign: 'left', lineHeight: 1.2, flex: 1 }}>
                                123, Main St
                            </p>
                        )}
                        {settings.showPhoneOnLabel && (
                            <p style={{ fontSize: 4, margin: 0, color: '#475569', textAlign: 'right', lineHeight: 1.2 }}>
                                9876543210
                            </p>
                        )}
                    </div>
                )}

                {/* Code area */}
                {isBoth ? (
                    /* "both" layout: QR LEFT, rotated barcode RIGHT, same height */
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <QRSvg size={qrSize} />
                        </div>
                        <div style={{ width: rotatedContainerW, height: rotatedContainerH, position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(90deg)', width: barcodeNaturalW, height: barcodeNaturalH }}>
                                <BarcodeSvg width={barcodeNaturalW} height={barcodeNaturalH} />
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Single-code layout: centered column */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' }}>
                        {format === 'barcode_only' && <BarcodeSvg width={80} height={24} />}
                        {format === 'qr_only' && <QRSvg size={qrSize} />}
                    </div>
                )}

                {/* Footer info */}
                <div style={{ width: '100%', textAlign: 'center' }}>
                    {settings.showBarcodeNumber && (
                        <p style={{ fontSize: 4.5, margin: 0, color: '#475569', fontFamily: 'monospace' }}>8901234567890</p>
                    )}
                    {settings.showProductNameOnLabel && (
                        <p style={{ fontSize: 6, fontWeight: 'bold', margin: 0, color: '#0f172a' }}>Fresh Apple (1 kg)</p>
                    )}
                    {settings.showMrpOnLabel && (
                        <p style={{ fontSize: 7, fontWeight: 'bold', margin: 0, color: '#0f172a' }}>MRP: ₹100</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Option config ─────────────────────────────────────────────────────────────

interface FormatOption {
    id: BarcodeFormat;
    title: string;
    use: string;
    recommended?: boolean;
    pros: string[];
    con: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
    {
        id: 'qr_only',
        title: 'QR code only',
        use: 'Customers and staff scan with any phone camera.',
        pros: ['Works with every phone', 'Holds more info (price, name)'],
        con: 'Most counter barcode scanners can’t read it',
    },
    {
        id: 'barcode_only',
        title: 'Barcode only',
        use: 'Classic retail barcode for USB / Bluetooth scanners.',
        pros: ['Works with every barcode scanner', 'Fastest at a busy counter'],
        con: 'Phones need an app to read it',
    },
    {
        id: 'both',
        title: 'Barcode + QR',
        use: 'Both codes on one label — any scanner or phone.',
        recommended: true,
        pros: ['Scans with anything', 'Safe if you change scanners'],
        con: 'Each code is smaller at 35 mm',
    },
];

type ToggleField =
    | 'showShopNameOnLabel'
    | 'showAddressOnLabel'
    | 'showPhoneOnLabel'
    | 'showBarcodeNumber'
    | 'showProductNameOnLabel'
    | 'showMrpOnLabel';

interface ContentOption {
    field: ToggleField;
    label: string;
    desc: string;
    icon: React.ReactNode;
}

const CONTENT_OPTIONS: ContentOption[] = [
    { field: 'showShopNameOnLabel', label: 'Shop name', desc: 'Your store name — at the top of the label.', icon: <FiHome size={16} /> },
    { field: 'showAddressOnLabel', label: 'Address', desc: 'Short address line, left side. Needs space.', icon: <FiMapPin size={16} /> },
    { field: 'showPhoneOnLabel', label: 'Phone number', desc: 'Your business phone number, right side.', icon: <FiPhone size={16} /> },
    { field: 'showBarcodeNumber', label: 'Barcode number', desc: 'Digits under the code — type it in if a scan fails.', icon: <FiHash size={16} /> },
    { field: 'showProductNameOnLabel', label: 'Product name', desc: 'Item name as in your item list.', icon: <FiTag size={16} /> },
    { field: 'showMrpOnLabel', label: 'MRP', desc: 'Required by law on packaged goods.', icon: <FiFileText size={16} /> },
];

// ─── Small UI pieces ───────────────────────────────────────────────────────────

const Toggle: React.FC<{ id: string; checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ id, checked, onChange, label }) => (
    <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-[22px] rounded-full border-0 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]
            ${checked ? 'bg-[#155dfc]' : 'bg-[#7a8aa3]'}`}
    >
        <span
            className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-150
                ${checked ? 'left-[21px]' : 'left-[3px]'}`}
        />
    </button>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; tone: 'blue' | 'green'; title: string; sub: string }> = ({ icon, tone, title, sub }) => (
    <div className="flex items-center gap-3 px-[18px] py-3.5 border-b border-[#dfe6fb]">
        <span
            className={`w-8 h-8 shrink-0 grid place-items-center rounded-sm
                ${tone === 'blue' ? 'bg-[#e6eeff] text-[#155dfc]' : 'bg-[#e9faef] text-[#008236]'}`}
        >
            {icon}
        </span>
        <div className="min-w-0">
            <h2 className="m-0 text-base font-semibold text-[#0f172b] leading-6">{title}</h2>
            <p className="m-0 text-xs text-[#5b6b86] leading-[18px]">{sub}</p>
        </div>
    </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────

const BarcodeSetting: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<BarcodeSettings | null>(null);
    const [savedSettings, setSavedSettings] = useState<BarcodeSettings | null>(null); // baseline for "unsaved changes"
    const [companyName, setCompanyName] = useState<string>('');
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
                setSavedSettings(data);
            } catch (err) {
                console.error('Failed to fetch barcode settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }

            // Company name for the preview (read-only; failure should not block settings)
            try {
                const companySnap = await getDoc(doc(db, 'companies', companyId));
                if (companySnap.exists()) {
                    const c = companySnap.data() as Record<string, any>;
                    setCompanyName(c.companyName ?? c.name ?? c.shopName ?? c.businessName ?? '');
                }
            } catch (err) {
                console.error('Failed to fetch company name:', err);
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
            setSavedSettings(settings);
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

    const handleDiscard = () => {
        if (savedSettings) setSettings(savedSettings);
    };

    // ── Loading ────────────────────────────────────────────────────────────────
    if (isLoading || !settings) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center bg-[#eef2ff]">
                <Spinner />
                <p className="mt-4 text-[#45556c]">Loading settings...</p>
            </div>
        );
    }

    // ── Derived (display only) ─────────────────────────────────────────────────
    const currentFormat: BarcodeFormat = settings.labelFormat ?? 'both';
    const currentFormatTitle = FORMAT_OPTIONS.find((o) => o.id === currentFormat)?.title;
    const TOTAL_UNITS = CONTENT_OPTIONS.length; // 6 toggles
    const linesUsed = CONTENT_OPTIONS.filter((o) => settings[o.field] ?? true).length;

    // Unsaved-change tracking (compares against last loaded/saved values)
    const changeLabels: string[] = [];
    if (savedSettings) {
        if ((settings.labelFormat ?? 'both') !== (savedSettings.labelFormat ?? 'both')) {
            changeLabels.push('Code type');
        }
        CONTENT_OPTIONS.forEach((o) => {
            if ((settings[o.field] ?? true) !== (savedSettings[o.field] ?? true)) {
                changeLabels.push(o.label);
            }
        });
    }
    const changeCount = changeLabels.length;

    return (
        <div className="flex flex-col min-h-screen bg-[#eef2ff] w-full">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* ── Top Bar ── */}
            <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#dfe6fb] sticky top-0 z-30">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    aria-label="Back"
                    className="w-10 h-10 grid place-items-center rounded-sm border border-[#7a8aa3] bg-white text-[#45556c] cursor-pointer hover:bg-[#f5f7ff] transition-colors"
                >
                    <FiChevronLeft size={20} />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="m-0 text-xs text-[#5b6b86] leading-[18px]">Settings</p>
                    <h1 className="m-0 text-lg font-semibold text-[#0f172b] leading-6 truncate">Barcode &amp; label settings</h1>
                </div>
                <ResetSettingsButton<BarcodeSettings>
                    defaults={getDefaultBarcodeSettings(currentUser?.companyId ?? '')}
                    onReset={setSettings}
                />
            </header>

            <main className="flex-grow w-full box-border px-4 pt-4 pb-6">
                <form onSubmit={handleSave} className="max-w-5xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-3 lg:gap-5 items-start">

                        {/* ── Preview (pinned on mobile, right column on desktop) ── */}
                        <aside className="order-first lg:order-last sticky top-[69px] lg:top-[88px] z-20">
                            <div className="bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] p-3 lg:p-4 flex flex-row lg:flex-col gap-3.5 lg:gap-4 items-center lg:items-stretch">

                                <div className="hidden lg:flex items-center gap-2">
                                    <h2 className="m-0 flex-1 text-sm font-semibold text-[#0f172b]">Label preview</h2>
                                    <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-[#e6eeff] text-[#155dfc] text-[11px] font-semibold">
                                        {currentFormatTitle}
                                    </span>
                                </div>

                                {/* Stage */}
                                <div className="relative shrink-0 grid place-items-center rounded-sm bg-[#f5f7ff] p-3 lg:p-0 lg:h-[190px]">
                                    <span className="hidden lg:block absolute top-1.5 left-1/2 -translate-x-1/2 text-[11px] text-[#5b6b86]">35 mm</span>
                                    <span className="hidden lg:block absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] text-[#5b6b86] [writing-mode:vertical-rl]">35 mm</span>
                                    <div className="lg:hidden">
                                        <LabelCard format={currentFormat} settings={settings} companyName={companyName} scale={0.85} />
                                    </div>
                                    <div className="hidden lg:block">
                                        <LabelCard format={currentFormat} settings={settings} companyName={companyName} scale={1.1} />
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1 lg:flex-none flex flex-col gap-2 lg:gap-3.5">
                                    <div className="lg:hidden">
                                        <p className="m-0 text-sm font-semibold text-[#0f172b]">Preview</p>
                                        <p className="m-0 text-xs text-[#45556c] leading-[18px]">35 × 35 mm · {currentFormatTitle}</p>
                                    </div>

                                    {/* Space used */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between text-[13px] text-[#0f172b]">
                                            <span>Space used</span>
                                            <b className="font-semibold">{linesUsed} of {TOTAL_UNITS} lines</b>
                                        </div>
                                        <div
                                            className="grid gap-[3px]"
                                            style={{ gridTemplateColumns: `repeat(${TOTAL_UNITS}, minmax(0, 1fr))` }}
                                        >
                                            {Array.from({ length: TOTAL_UNITS }).map((_, i) => (
                                                <i
                                                    key={i}
                                                    className={`h-1.5 rounded-sm ${i < linesUsed ? 'bg-[#155dfc]' : 'bg-[#dfe6fb]'}`}
                                                />
                                            ))}
                                        </div>
                                        <p className="m-0 text-xs text-[#5b6b86] leading-[18px]">
                                            Fewer lines = bigger, easier-to-scan codes.
                                        </p>
                                    </div>

                                    {/* Desktop-only details */}
                                    <div className="hidden lg:flex items-center gap-3">
                                        <div className="shrink-0 rounded-sm bg-[#f5f7ff] p-2">
                                            <LabelCard format={currentFormat} settings={settings} companyName={companyName} scale={0.75} />
                                        </div>
                                        <div className="min-w-0 flex flex-col gap-2">
                                            <p className="m-0 text-xs text-[#45556c] leading-[17px]">
                                                Actual size on screen. 35 × 35 mm sticker — fits most 1-up and 2-up label rolls.
                                            </p>
                                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] m-0">
                                                <dt className="text-[#5b6b86]">Size</dt>
                                                <dd className="m-0 font-medium text-[#0f172b]">35 × 35 mm (fixed)</dd>
                                                <dt className="text-[#5b6b86]">Code</dt>
                                                <dd className="m-0 font-medium text-[#0f172b]">{currentFormatTitle}</dd>
                                            </dl>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </aside>

                        {/* ── Left column ── */}
                        <div className="flex flex-col gap-3 lg:gap-4 min-w-0">

                            {/* Card 1: Code type */}
                            <section className="bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden">
                                <SectionHeader
                                    icon={<FiGrid size={18} />}
                                    tone="blue"
                                    title="Code type"
                                    sub="What gets scanned on your product labels"
                                />
                                <div className="p-3.5 lg:p-[18px]">
                                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-2 xl:gap-3">
                                        {FORMAT_OPTIONS.map((opt) => {
                                            const isSelected = settings.labelFormat === opt.id;
                                            return (
                                                <button
                                                    type="button"
                                                    key={opt.id}
                                                    aria-pressed={isSelected}
                                                    onClick={() => handleChange('labelFormat', opt.id)}
                                                    className={`relative text-left cursor-pointer rounded-sm border p-3 xl:p-3.5 flex flex-row xl:flex-col items-center xl:items-stretch gap-3 xl:gap-2.5 transition-colors duration-150
                                                        ${isSelected
                                                            ? 'border-[#155dfc] ring-1 ring-[#155dfc] bg-[#e6eeff]'
                                                            : 'border-[#7a8aa3] bg-white hover:bg-[#f5f7ff]'}`}
                                                >
                                                    {isSelected && (
                                                        <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#155dfc] text-white grid place-items-center">
                                                            <FiCheck size={12} strokeWidth={3} />
                                                        </span>
                                                    )}

                                                    {/* Thumbnail */}
                                                    <span className={`shrink-0 grid place-items-center rounded-sm p-1.5 xl:p-2.5 ${isSelected ? 'bg-white' : 'bg-[#f5f7ff]'}`}>
                                                        <span className="xl:hidden">
                                                            <LabelCard format={opt.id} settings={settings} companyName={companyName} scale={0.5} />
                                                        </span>
                                                        <span className="hidden xl:block">
                                                            <LabelCard format={opt.id} settings={settings} companyName={companyName} scale={0.72} />
                                                        </span>
                                                    </span>

                                                    {/* Text */}
                                                    <span className="flex flex-col gap-1 min-w-0 pr-6 xl:pr-0">
                                                        {opt.recommended && (
                                                            <span className="self-start text-[10px] font-semibold uppercase tracking-[0.06em] text-[#008236] bg-[#e9faef] rounded-sm px-2 py-px">
                                                                Recommended
                                                            </span>
                                                        )}
                                                        <b className="text-[15px] font-semibold text-[#0f172b]">{opt.title}</b>
                                                        <span className="text-xs text-[#45556c] leading-[17px]">{opt.use}</span>

                                                        <ul className="hidden xl:flex flex-col gap-[3px] list-none m-0 mt-1.5 p-0 text-xs leading-4">
                                                            {opt.pros.map((p) => (
                                                                <li key={p} className="flex gap-1.5 items-start text-[#45556c]">
                                                                    <FiCheck size={14} className="shrink-0 mt-px text-[#008236]" />
                                                                    {p}
                                                                </li>
                                                            ))}
                                                            <li className="flex gap-1.5 items-start text-[#45556c]">
                                                                <FiX size={14} className="shrink-0 mt-px text-[#d5000c]" />
                                                                {opt.con}
                                                            </li>
                                                        </ul>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="m-0 mt-3 text-xs text-[#5b6b86]">
                                        All labels print at <b className="font-semibold text-[#45556c]">35 × 35 mm</b>.
                                    </p>
                                </div>
                            </section>

                            {/* Card 2: What's printed */}
                            <section className="bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden">
                                <SectionHeader
                                    icon={<FiList size={18} />}
                                    tone="green"
                                    title="What’s printed"
                                    sub="Turn lines on or off — the preview updates as you go"
                                />
                                <div>
                                    {CONTENT_OPTIONS.map((opt, idx) => {
                                        const checked = settings[opt.field] ?? true;
                                        const inputId = `toggle-${opt.field}`;
                                        return (
                                            <div
                                                key={opt.field}
                                                className={`flex items-center justify-between gap-4 px-[18px] py-3.5 ${idx !== CONTENT_OPTIONS.length - 1 ? 'border-b border-[#dfe6fb]' : ''}`}
                                            >
                                                <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                                                    <span className="flex items-center gap-2 text-sm font-medium text-[#0f172b]">
                                                        <span className="text-[#45556c] flex">{opt.icon}</span>
                                                        {opt.label}
                                                    </span>
                                                    <span className="block mt-0.5 text-xs text-[#5b6b86] leading-[18px]">{opt.desc}</span>
                                                </label>
                                                <Toggle
                                                    id={inputId}
                                                    checked={checked}
                                                    label={opt.label}
                                                    onChange={(v) => handleCheckboxChange(opt.field, v)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* Info note */}
                            <div className="flex gap-2 items-start px-3 py-2.5 rounded-sm bg-[#e6eeff] text-[#155dfc] text-xs leading-[19px]">
                                <FiHome size={16} className="shrink-0 mt-0.5" />
                                <span>Shop name comes from your company. Address, phone and item details in the preview are samples; printed labels use your real details.</span>
                            </div>
                        </div>
                    </div>
                </form>
            </main>

            {/* ── Save bar (same pattern as Bill settings) ── */}
            <div className="sticky bottom-0 z-20 mt-auto flex items-center gap-3 flex-wrap px-4 pt-2.5 pb-4 lg:px-6 lg:py-3 bg-white border-t border-[#dfe6fb] shadow-[0_-6px_16px_rgba(21,48,140,0.06)]">
                <span className={`w-2 h-2 rounded-sm shrink-0 ${changeCount === 0 ? 'bg-[#008236]' : 'bg-[#155dfc]'}`} />
                <span className="text-sm font-semibold text-[#0f172b]">
                    {changeCount === 0
                        ? 'All changes saved'
                        : `${changeCount} unsaved ${changeCount === 1 ? 'change' : 'changes'}`}
                </span>
                {changeCount > 0 && (
                    <span className="text-xs text-[#5b6b86] min-w-0 flex-[1_1_160px] truncate">
                        {changeLabels.join(' · ')}
                    </span>
                )}
                <div className="ml-auto flex gap-2">
                    <button
                        type="button"
                        onClick={handleDiscard}
                        disabled={changeCount === 0 || isSaving}
                        className="h-10 px-4 rounded-sm border border-transparent bg-transparent text-[#45556c] text-sm font-medium cursor-pointer hover:bg-[#f5f7ff] hover:text-[#0f172b] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="h-10 px-4 inline-flex items-center justify-center rounded-sm border border-transparent bg-[#155dfc] text-white text-sm font-medium cursor-pointer hover:bg-[#1447e6] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BarcodeSetting;