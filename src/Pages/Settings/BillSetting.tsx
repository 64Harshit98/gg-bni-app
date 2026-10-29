import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import SignatureCanvas from 'react-signature-canvas';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { State, PLANS } from '../../enums';
import { normalizePlan } from '../../context/Plan';
import { Modal } from '../../constants/Modal';
import { useNavigate } from 'react-router';
import BackButton from '../../Components/BackButton';

// --- Interfaces ---
export interface BillSettingsData {
    upiId?: string;
    termsAndConditions: string;
    signatureBase64?: string;
    printFormat?: 'A4' | 'A5' | 'THERMAL58' | 'THERMAL80';
    whatsappExtraMessage?: string;
    enableTriplicate?: boolean;
    discountDisplayFormat?: 'amount' | 'percentage';
    enableItemImages?: boolean;
}

// The raw shape persisted at companies/{companyId}/settings/bill — a single
// doc shared by this page (pos*-prefixed fields) and
// src/Catalogue/Settings/CatalogueBillSetting.tsx (catalogue*-prefixed
// fields), plus a few unprefixed fields both pages read/write directly.
export interface RawBillSettings {
    companyId: string;
    settingType: 'bill';
    upiId: string;
    signatureBase64: string;
    enableTriplicate: boolean;
    discountDisplayFormat: 'amount' | 'percentage';
    enableItemImages: boolean;
    posTermsAndConditions: string;
    posPrintFormat: 'A4' | 'A5' | 'THERMAL58' | 'THERMAL80';
    posWhatsappExtraMessage: string;
    catalogueTermsAndConditions: string;
    cataloguePrintFormat: 'A4' | 'A5' | 'THERMAL58' | 'THERMAL80';
    catalogueWhatsappExtraMessage: string;
}

const DEFAULT_TERMS_AND_CONDITIONS =
    '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.';

// Same shape SettingsContext.tsx's other getDefault*Settings functions use —
// a plain object keyed by companyId, persisted the first time any user from
// that company loads the app (see SettingsContext.tsx), so consumers that
// read settings/bill directly (e.g. CatalogueBill.tsx's PDF generator) can
// trust the doc always has real values instead of needing their own
// hardcoded fallback text.
export const getDefaultBillSettings = (companyId: string): RawBillSettings => ({
    companyId,
    settingType: 'bill',
    upiId: '',
    signatureBase64: '',
    enableTriplicate: false,
    discountDisplayFormat: 'amount',
    enableItemImages: false,
    posTermsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
    posPrintFormat: 'A4',
    posWhatsappExtraMessage: '',
    catalogueTermsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
    cataloguePrintFormat: 'A4',
    catalogueWhatsappExtraMessage: '',
});

interface BusinessInfoData {
    companyName: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
    panNumber: string;
    msmeNumber: string;
    bankName: string;
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    companyLogo: string;
}

// ─────────────────────────────────────────────────────────────
// UI-ONLY helpers (styling, icons, preview). No data logic here.
// ─────────────────────────────────────────────────────────────

const ICONS: Record<string, string[]> = {
    store: ['M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9h18M10 20v-5h4v5'],
    qr: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2'],
    print: ['M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2', 'M6 14h12v7H6z'],
    pen: ['M3 21c3-1 5-3 6-6l8-8 3 3-8 8c-3 1-5 3-6 6z', 'M14 6l3 3'],
    whatsapp: ['M4 20l1.3-4A8 8 0 1 1 8 18.7z', 'M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z'],
    list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
    doc: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5'],
    copy: ['M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4'],
    image: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M11 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'm21 17-5-5-9 8'],
    percent: ['M19 5 5 19', 'M9 6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', 'M20 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'],
    check: ['M5 12.5l4.5 4.5L19 7'],
    lock: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V7a4 4 0 0 1 8 0v4'],
    edit: ['M17 3l4 4L8 20H4v-4z'],
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
    eyeOff: ['M3 3l18 18', 'M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9', 'M6.6 7.6C3.9 9.3 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8'],
    wallet: ['M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6', 'M17.7 13.5a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z'],
    undo: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
    info: ['M12 3 2 20h20z', 'M12 10v4M12 17h.01'],
    upload: ['M12 21V9M7 14l5-5 5 5M4 3h16'],
};

const Icon: React.FC<{ name: string; size?: number; strokeWidth?: number }> = ({ name, size = 16, strokeWidth = 1.75 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
    >
        {(ICONS[name] || []).map((d, i) => (
            <path key={i} d={d} />
        ))}
    </svg>
);

const SECTIONS: { id: string; label: string; icon: string }[] = [
    { id: 'bs-business', label: 'Business details', icon: 'store' },
    { id: 'bs-payment', label: 'UPI payment', icon: 'qr' },
    { id: 'bs-print', label: 'Print', icon: 'print' },
    { id: 'bs-signature', label: 'Signature', icon: 'pen' },
    { id: 'bs-whatsapp', label: 'WhatsApp message', icon: 'whatsapp' },
    { id: 'bs-terms', label: 'Terms & conditions', icon: 'list' },
];

const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

const maskAccount = (n: string) => (n && n.length > 4 ? `•••• •••• ${n.slice(-4)}` : n);

// ───── Real bill preview helpers ─────
const PAPER_W = { A4: 794, A5: 559, THERMAL80: 302, THERMAL58: 219 } as const; // px @96dpi = real mm

const SAMPLE_ITEMS = [
    { name: 'Cotton shirt', qty: 1, rate: 1000, disc: 100, pct: '10%', amount: 900 },
    { name: 'Denim jeans', qty: 1, rate: 499, disc: 41, pct: '8%', amount: 458 },
];
const SAMPLE_TOTAL = 1358;

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Standard UPI deep-link; any UPI app scans this
export const buildUpiUrl = (upiId: string, payee: string, amount: number) =>
    `upi://pay?pa=${upiId.trim()}&pn=${encodeURIComponent(payee)}&am=${amount.toFixed(2)}&cu=INR`;

// Only thing that can't be expressed as Tailwind utilities: hide the app and
// print just the sample bill (rendered in a portal under <body>).
const PRINT_CSS = `@media print {
  body > *:not(.bs-print-root) { display: none !important; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .bs-print-root, .bs-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

// ───── Shared Tailwind class strings ─────
const CARD = 'bg-white border border-indigo-100 shadow-sm rounded-sm overflow-hidden min-w-0 scroll-mt-[130px] lg:scroll-mt-[90px]';
const OPT = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 items-center px-3.5 py-3 lg:px-[18px] lg:py-3.5 border-b border-indigo-100 last:border-b-0';
const OPT_X = 'col-span-full grid gap-2.5';
const OPT_T = 'flex items-center gap-2 text-sm font-medium leading-5 text-slate-900 [&>svg]:text-slate-500';
const OPT_D = 'text-xs leading-[18px] text-slate-500 mt-0.5';
const BTN = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm border border-transparent text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const BTN_SM = 'h-8 px-3 text-[13px]';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_SECONDARY = `${BTN} bg-white text-slate-900 border-slate-400 hover:bg-indigo-50`;
const BTN_DANGER = `${BTN} text-red-600 hover:bg-red-50`;
const BTN_GHOST = `${BTN} text-slate-600 hover:bg-indigo-50 hover:text-slate-900`;
const BTN_LINK = `${BTN} h-6 px-1.5 text-blue-600 hover:bg-blue-50`;
const NOTE = 'flex items-start gap-2 px-3 py-2.5 text-[13px] leading-[19px] font-medium bg-amber-50 text-amber-800 rounded-sm';
const TEXTAREA = 'w-full rounded-sm border border-slate-400 px-3 py-2.5 text-sm leading-[22px] text-slate-900 bg-white resize-y outline-none placeholder:text-slate-500 focus:outline-2 focus:outline focus:outline-offset-1 focus:outline-blue-600';
const RESET_BTN = 'ml-auto hidden lg:block text-xs text-slate-500 hover:text-slate-900 hover:underline';

const TINTS: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    magenta: 'bg-pink-100 text-pink-700',
};

const CardHeader: React.FC<{ icon: string; tint?: keyof typeof TINTS; title: string; sub: string; onReset?: () => void }> = ({
    icon, tint = 'blue', title, sub, onReset,
}) => (
    <div className="flex items-center gap-3 px-3.5 py-3 lg:px-[18px] lg:py-3.5 border-b border-indigo-100">
        <span className={`w-8 h-8 shrink-0 inline-grid place-items-center rounded-sm ${TINTS[tint]}`}>
            <Icon name={icon} size={18} />
        </span>
        <div className="flex-1 min-w-0">
            <b className="block text-[15px] lg:text-base leading-[22px] font-semibold">{title}</b>
            <small className="block text-xs leading-[18px] text-slate-500 font-normal">{sub}</small>
        </div>
        {onReset && (
            <button type="button" className={RESET_BTN} onClick={onReset}>
                Reset to default
            </button>
        )}
    </div>
);

const ChangedTag: React.FC = () => (
    <span className="ml-2 px-2 py-px rounded-sm bg-white text-blue-600 text-[10px] font-semibold uppercase tracking-wider">Changed</span>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
    <label className="inline-flex cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
        <span className="relative inline-block w-10 h-[22px] rounded-full bg-slate-400 shrink-0 transition-colors peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600" />
    </label>
);

// ───── Scales a fixed-size paper down to fit the preview column ─────
const ScaledPaper: React.FC<{ width: number; children: React.ReactNode }> = ({ width, children }) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [h, setH] = useState(0);
    useLayoutEffect(() => {
        const w = wrapRef.current;
        if (!w) return;
        const update = () => {
            setScale(Math.min(1, w.clientWidth / width));
            setH(innerRef.current?.offsetHeight || 0);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(w);
        if (innerRef.current) ro.observe(innerRef.current);
        return () => ro.disconnect();
    }, [width]);
    return (
        <div
            ref={wrapRef}
            className="border border-indigo-100 overflow-hidden bg-white shadow-lg rounded-sm"
            style={{ height: h * scale }}
        >
            <div ref={innerRef} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                {children}
            </div>
        </div>
    );
};

// ───── Bill paper (same layouts as the real printed bills) ─────
const PAPER = 'relative bg-white text-black font-[Arial,Helvetica,sans-serif] text-[11px] leading-[1.35] p-3.5 overflow-hidden [&_table]:w-full [&_table]:border-collapse';
const WM = 'absolute inset-0 grid place-items-center text-[100px] font-bold text-black/[0.06] -rotate-[40deg] pointer-events-none';
const GRID_C = 'border border-black px-1 py-1.5 text-center';
const GRID_L = 'border border-black px-1 py-1.5 text-left';
const GRID_R = 'border border-black px-1 py-1.5 text-right';
const TOT = 'flex justify-between px-2 py-1.5 border border-black border-t-0';
const TWO = 'grid grid-cols-2 border border-black border-t-0 [&>div]:p-2 [&>div]:border-r [&>div]:border-black [&>div:last-child]:border-r-0';
const TH_HR = 'border-0 border-t border-dashed border-black my-1.5';

const BillPaper: React.FC<{ business: BusinessInfoData; settings: BillSettingsData; gstinBad?: boolean }> = ({
    business, settings, gstinBad,
}) => {
    const f = settings.printFormat || 'A4';
    const hasName = !!business.companyName && business.companyName !== 'Not Set';
    const name = hasName ? business.companyName : 'Your company';
    const phone = business.phone && business.phone !== 'Not Set' ? business.phone : '';
    const pct = settings.discountDisplayFormat === 'percentage';
    const disc = (i: (typeof SAMPLE_ITEMS)[0]) => (pct ? i.pct : money(i.disc));
    const terms = (settings.termsAndConditions || '').trim();
    const upi = (settings.upiId || '').trim();
    const today = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const showPhotos = !!settings.enableItemImages;

    const qr = upi ? (
        <div className="inline-grid justify-items-center text-[9px]">
            <QRCodeSVG value={buildUpiUrl(upi, name, SAMPLE_TOTAL)} size={f === 'A4' ? 78 : 72} />
            <div>Scan to Pay</div>
        </div>
    ) : null;
    const logo = business.companyLogo ? (
        <img className="max-w-[100px] max-h-[60px] object-contain ml-auto block" src={business.companyLogo} alt="" />
    ) : null;
    const sig = settings.signatureBase64 ? (
        <img className="max-h-[50px] max-w-[130px] block mx-auto" src={settings.signatureBase64} alt="" />
    ) : null;

    // ── THERMAL 58 / 80 ──
    if (f === 'THERMAL58' || f === 'THERMAL80') {
        return (
            <div className={`${PAPER} !p-2`} style={{ width: PAPER_W[f] }}>
                <div className="text-center font-bold text-[15px]">{name}</div>
                {business.address && <div className="text-center">{business.address}</div>}
                {phone && <div className="text-center">Ph: {phone}</div>}
                <div className="text-center font-bold mt-1">BILL OF SUPPLY</div>
                <div className="flex justify-between gap-1">
                    <span>Date: {today.split(',')[0]}</span><span>Bill No: INV-128</span>
                </div>
                <div>Customer: Priya Sharma</div>
                <hr className={TH_HR} />
                <table className="[&_td]:py-0.5 [&_th]:py-0.5 [&_th]:text-left [&_td]:text-left">
                    <thead>
                        <tr>
                            <th>Particulars</th>
                            <th className="!text-right">Qty</th>
                            <th className="!text-right">Price</th>
                            <th className="!text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {SAMPLE_ITEMS.map(i => (
                            <tr key={i.name}>
                                <td>{i.name}</td>
                                <td className="!text-right">{i.qty}</td>
                                <td className="!text-right">{money(i.rate)}</td>
                                <td className="!text-right">{money(i.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <hr className={TH_HR} />
                <div className="text-right font-bold">Total : {money(SAMPLE_TOTAL)}</div>
                <hr className={TH_HR} />
                {terms && <div className="whitespace-pre-line">{terms}</div>}
                <div className="text-center font-bold mt-1.5">THANK YOU Visit Again</div>
                <div className="text-center">Powered by SELLAR.IN</div>
            </div>
        );
    }

    // ── A5 ──
    if (f === 'A5') {
        return (
            <div className={PAPER} style={{ width: PAPER_W.A5 }}>
                <div className={WM}>SELLAR.IN</div>
                <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 p-2 border border-black">
                    <div>{qr}</div>
                    <div className="text-center font-bold text-[28px]">{name}</div>
                    <div className="text-right">
                        {business.msmeNumber && <div className="text-[10px]">Msme No : {business.msmeNumber}</div>}
                        {logo}
                    </div>
                </div>
                <div className="grid grid-cols-3 border border-black mt-3 [&>div]:p-2 [&>div]:border-r [&>div]:border-black [&>div]:min-h-[90px] [&>div:last-child]:border-r-0">
                    <div><b>INVOICE DETAILS</b><br /><b>Invoice No : INV-128<br />Date : {today}</b></div>
                    <div><b>BILLED TO<br /><br />Priya Sharma<br />Phone : 9811024567</b></div>
                    <div><b>SHIPPED TO<br /><br />Priya Sharma<br />Phone : 9811024567</b></div>
                </div>
                <table className="mt-3">
                    <thead>
                        <tr>
                            {['S. No.', 'Product', 'Qty.', 'Price', 'GST (%)', 'GST Amt', 'Discount', 'Amount'].map(h => (
                                <th key={h} className={GRID_C}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {SAMPLE_ITEMS.map((i, n) => (
                            <tr key={i.name}>
                                <td className={GRID_C}>{n + 1}</td><td className={GRID_C}>{i.name}</td><td className={GRID_C}>{i.qty}</td>
                                <td className={GRID_C}>{money(i.rate)}</td><td className={GRID_C}>0%</td><td className={GRID_C}>0.00</td>
                                <td className={GRID_C}>{disc(i)}</td><td className={GRID_C}>{money(i.amount)}</td>
                            </tr>
                        ))}
                        <tr>
                            <td colSpan={7} className={`${GRID_R} font-bold text-sm`}>GRAND TOTAL</td>
                            <td className={`${GRID_C} font-bold text-sm`}>{money(SAMPLE_TOTAL)}</td>
                        </tr>
                    </tbody>
                </table>
                {business.bankName && (
                    <table className="!w-[55%] mt-3.5 ml-auto text-[9px]">
                        <thead><tr><th colSpan={2} className={GRID_C}>BANK DETAIL</th></tr></thead>
                        <tbody>
                            <tr><td className={GRID_L}>Bank : {business.bankName}</td><td className={GRID_L}>A/C No : {business.accountNumber}</td></tr>
                            <tr><td colSpan={2} className={GRID_L}>IFSC : {business.ifscCode}</td></tr>
                        </tbody>
                    </table>
                )}
                <div className="flex justify-between items-end mt-10">
                    <div>
                        <div className="font-bold text-sm mb-1">Terms &amp; Conditions</div>
                        <div className="font-bold whitespace-pre-line text-neutral-600">{terms}</div>
                    </div>
                    <div className="text-center">{sig}<div className="font-bold">Authorised Sign</div></div>
                </div>
                <div className="flex justify-between mt-4 pt-2.5 border-t border-neutral-300">
                    <div className="font-bold">{business.address}<br />Contact No. - {phone}</div>
                    <div className="text-right">Powered by <b className="text-blue-700 underline">SELLAR.IN</b><br />Made with pride in India</div>
                </div>
            </div>
        );
    }

    // ── A4 ──
    return (
        <div className={PAPER} style={{ width: PAPER_W.A4 }}>
            <div className={WM}>SELLAR.IN</div>
            <div className="text-right text-[9px]">Bill generated on {today}</div>
            <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 p-2 border border-black">
                <div>{qr}</div>
                <div className="text-center">
                    <div className="font-bold text-[13px]">BILL OF SUPPLY</div>
                    <div className="font-bold text-2xl">{name.toUpperCase()}</div>
                    <div>{business.address}</div>
                    {phone && <div>Phone : {phone}</div>}
                    {business.gstin && (
                        <div className={`font-bold mt-1 ${gstinBad ? 'outline outline-2 outline-blue-600 text-amber-700' : ''}`}>
                            GSTIN : {business.gstin}
                        </div>
                    )}
                </div>
                <div className="text-right">
                    {business.msmeNumber && <div className="font-bold text-[10px]">Msme No : {business.msmeNumber}</div>}
                    {logo}
                </div>
            </div>
            <div className={TWO}><div>Invoice No. : INV-128<br />Date : {today}</div><div /></div>
            <div className={`${TWO} min-h-[90px]`}>
                <div><b>Billed to :</b><br />Priya Sharma<br />Phone.No. : 9811024567</div>
                <div><b>Shipped to :</b><br />Priya Sharma<br />Phone.No. : 9811024567</div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th className={GRID_C}>S.N.</th>
                        {showPhotos && <th className={GRID_C}>Image</th>}
                        {['Items', 'HSN', 'Qty', 'Unit', 'MRP', 'Discount', 'Subtotal', 'IGST', 'IGST Amt', 'Amount'].map(h => (
                            <th key={h} className={GRID_C}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {SAMPLE_ITEMS.map((i, n) => (
                        <tr key={i.name}>
                            <td className={GRID_C}>{n + 1}</td>
                            {showPhotos && (
                                <td className={GRID_C}><span className="inline-block w-4 h-4 bg-gray-200 rounded-sm" /></td>
                            )}
                            <td className={GRID_C}>{i.name}</td><td className={GRID_C}>N/A</td><td className={GRID_C}>{i.qty}</td>
                            <td className={GRID_C}>pcs</td><td className={GRID_C}>{money(i.rate)}</td>
                            <td className={GRID_C}>{disc(i)}</td><td className={GRID_C}>{money(i.amount)}</td>
                            <td className={GRID_C}>-</td><td className={GRID_C}>-</td><td className={GRID_R}>{money(i.amount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className={TOT}><span>Add : Rounded off (+)</span><span>0.00</span></div>
            <div className={`${TOT} font-bold`}><span>Grand Total &nbsp; 2.000 Unit</span><span>Rs. {money(SAMPLE_TOTAL)}</span></div>
            <div className={TOT}><span>Amount Paid (-)</span><span>{money(SAMPLE_TOTAL)}</span></div>
            <div className={`${TOT} font-bold`}><span>Balance Due</span><span>0.00</span></div>
            <div className={`${TOT} mt-3.5`}><b>Rs. One Thousand Three Hundred and Fifty Eight Only</b><span /></div>
            {business.bankName && (
                <div className={`${TOT} font-bold !justify-start gap-5`}>
                    <span>BANK DETAIL :</span>
                    <span>A/C Holder Name : {business.accountHolderName} &nbsp; IFSC Code : {business.ifscCode}<br />Bank name : {business.bankName} , A/C NO : {business.accountNumber}</span>
                </div>
            )}
            <div className="grid grid-cols-[2fr_1.4fr_1.2fr] border border-black border-t-0 [&>div]:p-2 [&>div]:border-r [&>div]:border-black [&>div]:min-h-[110px] [&>div:last-child]:border-r-0">
                <div><b>Terms &amp; Condition</b><div>E. &amp; O. E.</div><div className="whitespace-pre-line">{terms}</div></div>
                <div><b>Receiver's Signature :</b></div>
                <div className="text-center"><b className="text-[10px]">for {name}</b><div className="min-h-[60px]">{sig}</div><b>Authorised Signatory</b></div>
            </div>
            <div className="text-center mt-5 text-[10px]">Powered by <b className="text-blue-700 underline">SELLAR.IN</b><br />Made with Love in India</div>
        </div>
    );
};

// Live bill preview. Reads the same state the page already holds — it does
// not touch Firestore or change any setting.
const BillPreview: React.FC<{
    business: BusinessInfoData;
    settings: BillSettingsData;
    gstinBad: boolean;
    onPrintTest: () => void;
}> = ({ business, settings, gstinBad, onPrintTest }) => {
    const fmt = settings.printFormat || 'A4';
    const fmtLabel = fmt === 'THERMAL58' ? '2-inch' : fmt === 'THERMAL80' ? '3-inch' : fmt;

    return (
        <div className={CARD} id="bs-preview">
            <div className="bg-indigo-50/60 p-3.5 grid gap-2.5">
                <div className="flex items-center gap-2">
                    <b className="text-sm flex-1">Bill preview</b>
                    {settings.enableTriplicate && (
                        <span className="text-[11px] font-semibold tracking-wide px-2.5 py-0.5 bg-indigo-50 text-slate-600 border border-indigo-100 rounded-sm whitespace-nowrap">3 copies</span>
                    )}
                    <span className="text-[11px] font-semibold tracking-wide px-2.5 py-0.5 bg-blue-100 text-blue-600 border border-blue-100 rounded-sm whitespace-nowrap">
                        {fmtLabel}
                    </span>
                </div>

                <ScaledPaper width={PAPER_W[fmt]}>
                    <BillPaper business={business} settings={settings} gstinBad={gstinBad} />
                </ScaledPaper>

                <div className="text-xs text-slate-500">
                    Same layout as your real printed bill. Updates as you change settings. A newly drawn signature shows here after you save.
                </div>
                <button type="button" aria-label="Print test bill" className={`${BTN_SECONDARY} ${BTN_SM} justify-self-start`} onClick={onPrintTest}>
                    <Icon name="print" />
                    <span className="hidden sm:inline">Print test bill</span>
                </button>
            </div>
        </div>
    );
};

const BillSettings: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const sigPadRef = useRef<any>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    // UI only: reveal/hide the masked account number in the read-only summary.
    const [showAccount, setShowAccount] = useState(false);
    // UI only: last loaded/saved values, used to show "N unsaved changes" + Discard.
    const [savedSettings, setSavedSettings] = useState<BillSettingsData | null>(null);
    const [sigDirty, setSigDirty] = useState(false);
    const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

    // Calculator Billing plans (POS Basic, Calc+Catalogue) always print on a
    // 2-inch thermal printer — Journal.tsx forces THERMAL58 at print time
    // regardless of what's saved here, so lock the setting itself to match
    // instead of letting the user pick a format that's silently ignored.
    const currentPlan = normalizePlan((currentUser as any)?.plan);
    const isThermalOnlyPlan = currentPlan === PLANS.POS_BASIC || currentPlan === PLANS.CALC_CATALOG;

    const [businessInfo, setBusinessInfo] = useState<BusinessInfoData>({
        companyName: '',
        address: '',
        phone: '',
        email: '',
        gstin: '',
        panNumber: '',
        msmeNumber: '',
        bankName: '',
        accountHolderName: '',
        accountNumber: '',
        ifscCode: '',
        companyLogo: '',
    });

    const [settings, setSettings] = useState<BillSettingsData>({
        upiId: '',
        termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
        signatureBase64: '',
        printFormat: 'A4',
        whatsappExtraMessage: '',
        enableTriplicate: false,
        discountDisplayFormat: 'amount',
        enableItemImages: false,
    });

    const formatAddress = (addr: any): string => {
        if (!addr) return '';
        if (typeof addr === 'string') return addr;
        const { streetAddress, city, state, postalCode, zipCode, pincode } = addr;
        const parts = [streetAddress, city, state].filter(part => part && part.trim() !== '');
        let fullAddress = parts.join(', ');
        const code = postalCode || zipCode || pincode;
        if (code) fullAddress += ` - ${code}`;
        return fullAddress;
    };

    // --- 1. Load Data with Priority Fallback ---
    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser?.companyId) return;

            try {
                setIsLoading(true);
                const companyId = currentUser.companyId;

                const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
                const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'bill');
                const userDocRef = currentUser.uid
                    ? doc(db, 'companies', companyId, 'users', currentUser.uid)
                    : null;

                const [businessSnap, settingsSnap, userSnap] = await Promise.all([
                    getDoc(businessDocRef),
                    getDoc(settingsDocRef),
                    userDocRef ? getDoc(userDocRef) : Promise.resolve(null),
                ]);

                const bData = businessSnap.exists() ? businessSnap.data() : {};
                const sData = settingsSnap.exists() ? settingsSnap.data() : {};
                const uData = userSnap?.exists() ? userSnap.data() : {};
                setBusinessInfo({
                    companyName: bData.businessName || bData.name || 'Not Set',
                    address: formatAddress(bData),
                    phone: bData.phoneNumber || bData.phone || uData.phoneNumber || uData.phone || 'Not Set',
                    email: bData.email || uData.email || 'Not Set',
                    gstin: bData.gstin || '',
                    panNumber: bData.panNumber || '',
                    msmeNumber: bData.msmeUdyamNumber || bData.registrationNumber || '',
                    bankName: bData.bankName || '',
                    accountHolderName: bData.accountHolderName || '',
                    accountNumber: bData.accountNumber || '',
                    ifscCode: bData.ifscCode || '',
                    companyLogo: bData.companyLogo || '',
                });

                const loadedSettings: BillSettingsData = {
                    upiId: sData.upiId || bData.upiId || '',
                    termsAndConditions: sData.posTermsAndConditions || DEFAULT_TERMS_AND_CONDITIONS,
                    signatureBase64: sData.signatureBase64 || '',
                    printFormat: isThermalOnlyPlan
                        ? (sData.posPrintFormat === 'THERMAL80' ? 'THERMAL80' : 'THERMAL58')
                        : (sData.posPrintFormat || 'A4'),
                    whatsappExtraMessage: sData.posWhatsappExtraMessage || '',
                    enableTriplicate: sData.enableTriplicate || false,
                    discountDisplayFormat: sData.discountDisplayFormat || 'amount',
                    enableItemImages: sData.enableItemImages || false,
                };

                setSettings(loadedSettings);
                setSavedSettings(loadedSettings); // UI only: baseline for "unsaved changes"

                if (loadedSettings.signatureBase64) {
                    setTimeout(() => {
                        if (sigPadRef.current) {
                            sigPadRef.current.fromDataURL(loadedSettings.signatureBase64);
                        }
                    }, 200);
                }
            } catch (error) {
                console.error('Error fetching bill settings:', error);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [currentUser]);

    // UI only: highlight the section currently in view in the nav / chips.
    useEffect(() => {
        if (isLoading || typeof IntersectionObserver === 'undefined') return;
        const obs = new IntersectionObserver(
            entries => {
                entries.forEach(en => {
                    if (en.isIntersecting) setActiveSection(en.target.id);
                });
            },
            { rootMargin: '-25% 0px -65% 0px' }
        );
        SECTIONS.forEach(sec => {
            const el = document.getElementById(sec.id);
            if (el) obs.observe(el);
        });
        return () => obs.disconnect();
    }, [isLoading]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const clearSignature = () => {
        sigPadRef.current?.clear();
        setSettings(prev => ({ ...prev, signatureBase64: '' }));
    };

    // --- 2. Save Data ---
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser?.companyId) return;

        try {
            setIsSaving(true);

            let currentSignature = settings.signatureBase64;

            if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
                currentSignature = sigPadRef.current.getCanvas().toDataURL('image/png');
            } else if (sigPadRef.current && sigPadRef.current.isEmpty()) {
                currentSignature = '';
            }

            const dataToSave = {
                // Editable settings (shared)
                upiId: settings.upiId,
                signatureBase64: currentSignature,

                // Editable settings (independent per bill type)
                posTermsAndConditions: settings.termsAndConditions,
                posPrintFormat: isThermalOnlyPlan
                    ? (settings.printFormat === 'THERMAL80' ? 'THERMAL80' : 'THERMAL58')
                    : settings.printFormat,
                posWhatsappExtraMessage: settings.whatsappExtraMessage,
                enableTriplicate: settings.enableTriplicate || false,
                discountDisplayFormat: settings.discountDisplayFormat || 'amount',
                enableItemImages: settings.enableItemImages || false,

                // Always sync from businessInfo so these stay fresh
                companyGstin: businessInfo.gstin,
                panNumber: businessInfo.panNumber,
                msmeNumber: businessInfo.msmeNumber,
                accountName: businessInfo.accountHolderName,
                accountNumber: businessInfo.accountNumber,
                bankName: businessInfo.bankName,
                ifscCode: businessInfo.ifscCode,
                updatedAt: serverTimestamp(),
            };

            const docRef = doc(db, 'companies', currentUser.companyId, 'settings', 'bill');
            await setDoc(docRef, dataToSave, { merge: true });

            setSettings(prev => ({ ...prev, signatureBase64: currentSignature }));
            setSavedSettings({ ...settings, signatureBase64: currentSignature }); // UI only
            setSigDirty(false); // UI only
            setModal({ message: 'Bill settings saved successfully!', type: State.SUCCESS });
        } catch (error) {
            console.error('Error saving bill settings:', error);
            setModal({ message: 'Failed to save settings.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    // ── UI-only handlers (local state only — nothing is written until Save) ──
    const redrawSignature = (dataUrl?: string) => {
        sigPadRef.current?.clear();
        if (dataUrl) sigPadRef.current?.fromDataURL(dataUrl);
    };

    const handleDiscard = () => {
        if (!savedSettings) return;
        setSettings(savedSettings);
        redrawSignature(savedSettings.signatureBase64);
        setSigDirty(false);
    };

    const handleClearSignatureClick = () => {
        clearSignature();
        setSigDirty(!!savedSettings?.signatureBase64);
    };

    const handleUploadSignature = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            redrawSignature(String(reader.result));
            setSigDirty(true);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const resetSection = (id: string) => {
        setSettings(prev => {
            switch (id) {
                case 'bs-payment':
                    return { ...prev, upiId: '' };
                case 'bs-print':
                    return {
                        ...prev,
                        printFormat: isThermalOnlyPlan ? 'THERMAL58' : 'A4',
                        enableTriplicate: false,
                        enableItemImages: false,
                        discountDisplayFormat: 'amount',
                    };
                case 'bs-whatsapp':
                    return { ...prev, whatsappExtraMessage: '' };
                case 'bs-terms':
                    return { ...prev, termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS };
                default:
                    return prev;
            }
        });
        if (id === 'bs-signature') handleClearSignatureClick();
    };

    // Prints the same sample bill at its real paper size.
    const handlePrintTestBill = () => {
        const f = settings.printFormat || 'A4';
        const size = f === 'A4' ? 'A4' : f === 'A5' ? 'A5' : f === 'THERMAL58' ? '58mm auto' : '80mm auto';
        const st = document.createElement('style');
        st.textContent = `@page { size: ${size}; margin: 0; }`;
        document.head.appendChild(st);
        const cleanup = () => {
            st.remove();
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        window.print();
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-slate-600 font-medium text-sm">Loading settings...</span>
            </div>
        );
    }

    // ── UI-only view helpers ──
    const FORMAT_OPTIONS: {
        value: 'A4' | 'A5' | 'THERMAL58' | 'THERMAL80';
        title: string;
        desc: string;
        paperW: number;
        lines: number[];
        hidden?: boolean;
    }[] = [
        { value: 'A4', title: 'A4 size', desc: 'Full page · GST invoices, wholesale', paperW: 40, lines: [70, 100, 100, 100, 60], hidden: isThermalOnlyPlan },
        { value: 'A5', title: 'A5 size', desc: 'Half page · Compact invoices', paperW: 32, lines: [70, 100, 100, 60], hidden: isThermalOnlyPlan },
        { value: 'THERMAL58', title: '2-inch thermal', desc: '58 mm roll · Small receipt printers', paperW: 18, lines: [60, 100, 80] },
        { value: 'THERMAL80', title: '3-inch thermal', desc: '80 mm roll · Most counter printers', paperW: 26, lines: [60, 100, 100, 80] },
    ];

    // Details that will print wrongly (display-only checks on read-only data)
    const gstinBad = !!businessInfo.gstin && !GSTIN_RE.test(businessInfo.gstin.trim());
    const panBad = !!businessInfo.panNumber && !PAN_RE.test(businessInfo.panNumber.trim());
    const msmeBad = !!businessInfo.msmeNumber && businessInfo.msmeNumber.trim().length < 8;
    const ifscBad = !!businessInfo.ifscCode && !IFSC_RE.test(businessInfo.ifscCode.trim());
    const fixCount = [gstinBad, panBad, msmeBad, ifscBad].filter(Boolean).length;

    const roField = (label: string, value: string, opts?: { full?: boolean; num?: boolean; hint?: string }) => (
        <div
            className={`px-3.5 py-3 sm:px-[18px] border-b border-indigo-100 min-w-0 sm:[&:nth-child(odd):not(.col-span-full)]:border-r ${opts?.full ? 'col-span-full' : ''}`}
        >
            <dt className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 mb-[3px]">{label}</dt>
            <dd className={`text-sm leading-5 break-words ${value ? 'font-medium text-slate-900' : 'font-normal text-slate-500'} ${opts?.num ? 'tabular-nums' : ''}`}>
                {value || 'Not added'}
            </dd>
            {opts?.hint && (
                <span className="flex items-center gap-1 text-xs leading-[18px] text-amber-700 font-medium mt-0.5">
                    <Icon name="info" size={13} />
                    {opts.hint}
                </span>
            )}
        </div>
    );

    const SUBH = 'col-span-full px-3.5 pt-2.5 pb-1.5 sm:px-[18px] text-[11px] font-semibold tracking-wider uppercase text-slate-500 bg-indigo-50/60';

    const discountExample =
        (settings.discountDisplayFormat ?? 'amount') === 'percentage'
            ? { disc: '10%', after: '₹900' }
            : { disc: '₹100', after: '₹900' };

    const waMessage = (settings.whatsappExtraMessage || '').trim();
    const waLen = (settings.whatsappExtraMessage || '').length;
    const shownCompany =
        businessInfo.companyName && businessInfo.companyName !== 'Not Set' ? businessInfo.companyName : 'your shop';
    const nowTime = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

    // Unsaved-change tracking (compares against what was loaded / last saved)
    const base = savedSettings;
    const chg = {
        upi: !!base && (settings.upiId || '') !== (base.upiId || ''),
        size: !!base && settings.printFormat !== base.printFormat,
        triplicate: !!base && !!settings.enableTriplicate !== !!base.enableTriplicate,
        photos: !!base && !!settings.enableItemImages !== !!base.enableItemImages,
        discount: !!base && (settings.discountDisplayFormat ?? 'amount') !== (base.discountDisplayFormat ?? 'amount'),
        signature: !!base && sigDirty,
        whatsapp: !!base && (settings.whatsappExtraMessage || '') !== (base.whatsappExtraMessage || ''),
        terms: !!base && settings.termsAndConditions !== base.termsAndConditions,
    };
    const changeLabels: string[] = [];
    if (chg.upi) changeLabels.push('UPI ID');
    if (chg.size) changeLabels.push('Bill size');
    if (chg.triplicate) changeLabels.push('Print 3 copies');
    if (chg.photos) changeLabels.push('Item photos');
    if (chg.discount) changeLabels.push('Discount display');
    if (chg.signature) changeLabels.push('Signature');
    if (chg.whatsapp) changeLabels.push('WhatsApp message');
    if (chg.terms) changeLabels.push('Terms & conditions');
    const changeCount = changeLabels.length;

    const optBg = (changed: boolean) => (changed ? 'bg-blue-50' : '');
    const termsContradict = /goods once sold will not be taken back/i.test(settings.termsAndConditions || '');
    const isThermalFmt = settings.printFormat === 'THERMAL58' || settings.printFormat === 'THERMAL80';

    return (
        <div className="min-h-full bg-indigo-50 text-slate-900 flex flex-col relative">
            <style>{PRINT_CSS}</style>

            {/* Print-only, full-size sample bill. Rendered in <body> so app layout can't add blank pages */}
            {createPortal(
                <div className="bs-print-root hidden print:block">
                    <BillPaper business={businessInfo} settings={settings} />
                </div>,
                document.body
            )}

            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* Header (+ section chips on mobile) */}
            <div className="sticky top-0 z-10 bg-white border-b border-indigo-100">
                <div className="flex items-center gap-1 lg:gap-3 px-3 py-2.5 lg:px-6 lg:py-3.5 max-w-[1240px] mx-auto">
                    <BackButton className="ml-1" />
                    <div className="min-w-0">
                        <div className="text-xs leading-4 text-slate-500">Settings /</div>
                        <h1 className="m-0 text-xl leading-7 lg:text-[22px] lg:leading-[30px] font-semibold tracking-tight">Bill settings</h1>
                    </div>
                    <span className="hidden lg:block text-xs text-slate-500 self-end pb-1">
                        What prints on your bills and how they&rsquo;re shared
                    </span>
                    <div className="hidden lg:block ml-auto">
                        <button type="button" className={BTN_SECONDARY} onClick={handlePrintTestBill}>
                            <Icon name="print" />
                            Print test bill
                        </button>
                    </div>
                    <button
                        type="button"
                        className="lg:hidden ml-auto w-10 h-10 grid place-items-center rounded-sm text-slate-600 hover:bg-indigo-50"
                        aria-label="Print test bill"
                        onClick={handlePrintTestBill}
                    >
                        <Icon name="print" size={20} />
                    </button>
                    <button
                        type="button"
                        className="lg:hidden w-10 h-10 grid place-items-center rounded-sm text-slate-600 hover:bg-indigo-50"
                        aria-label="Preview bill"
                        onClick={() => scrollToSection('bs-preview')}
                    >
                        <Icon name="eye" size={20} />
                    </button>
                </div>
                <div
                    className="flex lg:hidden gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="navigation"
                    aria-label="Bill settings sections"
                >
                    {SECTIONS.map(sec => (
                        <button
                            key={sec.id}
                            type="button"
                            aria-pressed={activeSection === sec.id}
                            onClick={() => scrollToSection(sec.id)}
                            className={`inline-flex items-center h-[30px] px-3 rounded-sm border text-xs font-medium leading-none whitespace-nowrap ${
                                activeSection === sec.id
                                    ? 'bg-slate-900 border-slate-900 text-white'
                                    : 'bg-white border-slate-400 text-slate-600 hover:bg-indigo-50'
                            }`}
                        >
                            {sec.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 px-4 pt-3 pb-6 lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-5 lg:px-6 lg:pt-5 xl:grid-cols-[176px_minmax(0,1fr)_360px] max-w-[1240px] w-full mx-auto">
                {/* Section nav (desktop) */}
                <nav className="hidden lg:grid gap-0.5 sticky top-[84px] self-start" aria-label="Bill settings sections">
                    {SECTIONS.map(sec => (
                        <button
                            key={sec.id}
                            type="button"
                            aria-current={activeSection === sec.id}
                            onClick={() => scrollToSection(sec.id)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-sm text-[13px] leading-[18px] font-medium text-left ${
                                activeSection === sec.id
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'text-slate-600 hover:bg-indigo-50 hover:text-slate-900'
                            }`}
                        >
                            <Icon name={sec.icon} />
                            {sec.label}
                            {sec.id === 'bs-business' && fixCount > 0 && (
                                <small className="ml-auto text-[11px] text-amber-700 font-medium">{fixCount} to fix</small>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="grid gap-3 lg:gap-4 min-w-0 content-start">
                    {/* SECTION 1: Business details — read-only, from Business Profile */}
                    <section className={CARD} id="bs-business">
                        <CardHeader icon="store" title="Business details" sub="Printed at the top of every bill · from your Business profile" />
                        <dl className="grid grid-cols-1 sm:grid-cols-2 m-0">
                            <div className="col-span-full flex items-center gap-3.5 px-3.5 py-3 sm:px-[18px] border-b border-indigo-100">
                                <span className="w-14 h-14 shrink-0 grid place-items-center overflow-hidden rounded-sm border border-indigo-100 bg-indigo-50/60 text-slate-500 text-[11px] font-semibold">
                                    {businessInfo.companyLogo ? (
                                        <img src={businessInfo.companyLogo} alt="Company Logo" className="w-full h-full object-contain p-1.5" />
                                    ) : (
                                        'LOGO'
                                    )}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <b className="text-[15px] font-semibold">{businessInfo.companyName}</b>
                                    <div className="text-xs text-slate-500">Logo printed at the top of A4 / A5 bills</div>
                                </div>
                            </div>
                            {roField('Registered address', businessInfo.address, { full: true })}
                            {roField('Phone', businessInfo.phone)}
                            {roField('Email', businessInfo.email)}

                            <div className={SUBH}>Tax &amp; registration</div>
                            {roField('GSTIN', businessInfo.gstin, { num: true, hint: gstinBad ? "Doesn't look like a valid GSTIN" : undefined })}
                            {roField('PAN', businessInfo.panNumber, { num: true, hint: panBad ? "Doesn't look like a valid PAN" : undefined })}
                            {roField('MSME / Udyam no.', businessInfo.msmeNumber, {
                                full: true,
                                hint: msmeBad ? `Looks incomplete — prints as "MSME: ${businessInfo.msmeNumber}"` : undefined,
                            })}

                            <div className={SUBH}>Bank details · printed for bank transfers</div>
                            {roField('Bank name', businessInfo.bankName)}
                            {roField('Account holder', businessInfo.accountHolderName)}
                            <div className="px-3.5 py-3 sm:px-[18px] border-b border-indigo-100 min-w-0 sm:border-r">
                                <dt className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 mb-[3px]">Account number</dt>
                                <dd className={`flex items-center gap-2 text-sm leading-5 tabular-nums ${businessInfo.accountNumber ? 'font-medium text-slate-900' : 'font-normal text-slate-500'}`}>
                                    {businessInfo.accountNumber
                                        ? showAccount ? businessInfo.accountNumber : maskAccount(businessInfo.accountNumber)
                                        : 'Not added'}
                                    {businessInfo.accountNumber && (
                                        <button
                                            type="button"
                                            className={BTN_LINK}
                                            onClick={() => setShowAccount(v => !v)}
                                            aria-label={showAccount ? 'Hide account number' : 'Show account number'}
                                        >
                                            <Icon name={showAccount ? 'eyeOff' : 'eye'} />
                                            {showAccount ? 'Hide' : 'Show'}
                                        </button>
                                    )}
                                </dd>
                            </div>
                            {roField('IFSC', businessInfo.ifscCode, { num: true, hint: ifscBad ? 'IFSC has 11 characters, like SBIN0001234' : undefined })}
                        </dl>
                        <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-3 lg:px-[18px] bg-indigo-50/60 text-xs text-slate-600">
                            <span className="flex flex-1 min-w-[160px] items-center gap-2">
                                <Icon name="lock" />
                                <span className="block">
                                    Read only here.
                                    {fixCount > 0 && (
                                        <> <b>{fixCount} {fixCount === 1 ? 'detail needs' : 'details need'} fixing</b> before {fixCount === 1 ? 'it prints' : 'they print'} correctly.</>
                                    )}
                                </span>
                            </span>
                            <button
                                type="button"
                                className={`${BTN_SECONDARY} ${BTN_SM}`}
                                onClick={() => navigate('/edit-profile')}
                            >
                                <Icon name="edit" />
                                Edit in Business profile
                            </button>
                        </div>
                    </section>

                    {/* SECTION 2: UPI ID */}
                    <section className={CARD} id="bs-payment">
                        <CardHeader
                            icon="qr"
                            tint="green"
                            title="UPI payment"
                            sub="Customers scan the QR on the bill to pay"
                            onReset={() => resetSection('bs-payment')}
                        />
                        <div className={`${OPT} ${optBg(chg.upi)}`}>
                            <div className="grid gap-1.5 min-w-0">
                                <label className="block text-xs font-medium text-slate-600" htmlFor="bs-upi">
                                    UPI ID{chg.upi && <ChangedTag />}
                                </label>
                                <label className="flex items-center gap-2 h-10 px-3 w-full min-w-0 max-w-[360px] rounded-sm border border-slate-400 bg-white text-slate-500 focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-blue-600">
                                    <Icon name="wallet" />
                                    <input
                                        id="bs-upi"
                                        type="text"
                                        name="upiId"
                                        value={settings.upiId || ''}
                                        onChange={handleChange}
                                        placeholder="e.g. yourname@upi"
                                        className="flex-1 w-0 min-w-0 border-0 outline-none bg-transparent text-sm leading-5 text-slate-900 placeholder:text-slate-500"
                                    />
                                </label>
                                {settings.upiId ? (
                                    <div className="flex items-center gap-1.5 text-xs leading-[18px] text-green-700">
                                        <Icon name="check" />
                                        A QR with the bill amount prints on every bill
                                    </div>
                                ) : (
                                    <div className={OPT_D}>UPI ID displayed on invoices for quick payments.</div>
                                )}
                            </div>
                            <div className="grid justify-items-center gap-1">
                                {(settings.upiId || '').trim() ? (
                                    <div className="p-1.5 bg-white border border-indigo-100 leading-[0] rounded-sm">
                                        <QRCodeSVG value={buildUpiUrl(settings.upiId || '', shownCompany, SAMPLE_TOTAL)} size={84} />
                                    </div>
                                ) : (
                                    <i className="block w-16 h-16 rounded-sm border border-indigo-100 opacity-35 bg-[repeating-conic-gradient(#0f172b_0_25%,#fff_0_50%)] bg-[length:10px_10px]" />
                                )}
                                <span className="text-xs text-slate-500">QR preview</span>
                            </div>
                        </div>
                    </section>

                    {/* SECTION 3: Print preferences */}
                    <section className={CARD} id="bs-print">
                        <CardHeader
                            icon="print"
                            tint="amber"
                            title="Print"
                            sub="Default bill format and what appears on it"
                            onReset={() => resetSection('bs-print')}
                        />

                        <div className={`${OPT} ${optBg(chg.size)}`}>
                            <div className={OPT_X}>
                                <div>
                                    <div className={OPT_T}><Icon name="doc" />Default bill size{chg.size && <ChangedTag />}</div>
                                    <div className={OPT_D}>Used when you press Print. You can still pick another size on the bill.</div>
                                </div>
                                {isThermalOnlyPlan && (
                                    <div className={NOTE}>
                                        <Icon name="info" />
                                        <span>Your plan bills on a 2-Inch Thermal printer only — A4/A5 formats aren't available.</span>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {FORMAT_OPTIONS.filter(o => !o.hidden).map(o => {
                                        const on = settings.printFormat === o.value;
                                        return (
                                            <label
                                                key={o.value}
                                                className={`relative grid grid-cols-[44px_1fr] gap-3 items-center p-3 rounded-sm bg-white cursor-pointer text-left focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${
                                                    on
                                                        ? 'border-2 border-blue-600 p-[11px] bg-blue-50'
                                                        : 'border border-slate-400 hover:bg-indigo-50/60'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="printFormat"
                                                    value={o.value}
                                                    checked={on}
                                                    onChange={handleChange}
                                                    className="sr-only"
                                                />
                                                {on && (
                                                    <span className="absolute top-2.5 right-2.5 w-5 h-5 grid place-items-center rounded-sm bg-blue-600 text-white">
                                                        <Icon name="check" size={12} strokeWidth={3} />
                                                    </span>
                                                )}
                                                <span className="grid place-items-center w-11">
                                                    <span
                                                        className="bg-white border border-indigo-100 rounded-[3px] grid gap-[3px] p-[5px] content-start h-[52px] mx-auto"
                                                        style={{ width: o.paperW }}
                                                    >
                                                        {o.lines.map((w, i) => (
                                                            <i key={i} className="block h-[3px] rounded-sm bg-slate-400" style={{ width: `${w}%` }} />
                                                        ))}
                                                    </span>
                                                </span>
                                                <span>
                                                    <b className="block text-sm font-semibold leading-5">{o.title}</b>
                                                    <small className="block text-xs leading-4 text-slate-500">{o.desc}</small>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Triplicate toggle */}
                        <div className={`${OPT} ${optBg(chg.triplicate)}`}>
                            <div>
                                <div className={OPT_T}><Icon name="copy" />Print 3 copies{chg.triplicate && <ChangedTag />}</div>
                                <div className={OPT_D}>
                                    1 original + 2 copies stamped &ldquo;DUPLICATE&rdquo; — for transporter and your records.
                                </div>
                            </div>
                            <Toggle
                                checked={!!settings.enableTriplicate}
                                onChange={v => setSettings(prev => ({ ...prev, enableTriplicate: v }))}
                            />
                        </div>

                        {/* Item images toggle */}
                        <div className={`${OPT} ${optBg(chg.photos)}`}>
                            <div>
                                <div className={OPT_T}><Icon name="image" />Show item photos{chg.photos && <ChangedTag />}</div>
                                <div className={OPT_D}>Small photo next to each item. A4 bills only.</div>
                            </div>
                            <Toggle
                                checked={!!settings.enableItemImages}
                                onChange={v => setSettings(prev => ({ ...prev, enableItemImages: v }))}
                            />
                        </div>

                        {/* Discount display format */}
                        <div className={`${OPT} ${optBg(chg.discount)}`}>
                            <div className={OPT_X}>
                                <div>
                                    <div className={OPT_T}><Icon name="percent" />Show discount as{chg.discount && <ChangedTag />}</div>
                                    <div className={OPT_D}>How the Disc1 + Disc2 column is shown on the printed/PDF bill.</div>
                                </div>
                                <div className="grid gap-2.5 justify-items-start">
                                    <div
                                        className={`inline-flex p-[3px] gap-0.5 rounded-sm border border-indigo-100 ${chg.discount ? 'bg-white' : 'bg-indigo-50/60'}`}
                                        role="group"
                                        aria-label="Discount display format"
                                    >
                                        {[
                                            { label: 'Amount (₹)', value: 'amount' },
                                            { label: 'Percentage (%)', value: 'percentage' },
                                        ].map(opt => {
                                            const on = (settings.discountDisplayFormat ?? 'amount') === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    aria-pressed={on}
                                                    onClick={() =>
                                                        setSettings(prev => ({ ...prev, discountDisplayFormat: opt.value as 'amount' | 'percentage' }))
                                                    }
                                                    className={`h-[30px] px-3.5 rounded-sm text-[13px] font-medium leading-none ${
                                                        on ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="inline-flex items-center gap-1.5 w-fit px-3 py-2 rounded-sm bg-indigo-50/60 text-xs text-slate-600">
                                        Shirt ₹1,000 · disc. <b className="text-slate-900 tabular-nums">{discountExample.disc}</b> → {discountExample.after}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* SECTION 4: Digital signature */}
                    <section className={CARD} id="bs-signature">
                        <CardHeader
                            icon="pen"
                            tint="magenta"
                            title="Signature"
                            sub="Printed above “Authorised signatory”"
                            onReset={() => resetSection('bs-signature')}
                        />
                        <div className={`${OPT} ${optBg(chg.signature)}`}>
                            <div className={OPT_X}>
                                {chg.signature && <div><ChangedTag /></div>}
                                <div className="relative min-h-[150px] flex justify-center items-center overflow-hidden rounded-sm border-[1.5px] border-dashed border-slate-400 bg-indigo-50/60">
                                    <SignatureCanvas
                                        ref={sigPadRef}
                                        penColor="black"
                                        onEnd={() => setSigDirty(true)}
                                        canvasProps={{
                                            className: 'signature-canvas',
                                            style: { width: '100%', height: '150px' },
                                        }}
                                        backgroundColor="rgba(255,255,255,0)"
                                    />
                                    <div className="absolute inset-0 pointer-events-none select-none">
                                        <div className="absolute inset-0 grid place-items-center text-slate-500 opacity-20 text-[34px] font-semibold tracking-wide">
                                            SIGN HERE
                                        </div>
                                        <span className="absolute left-6 right-6 bottom-[34px] border-t border-slate-400" />
                                        <span className="absolute left-6 bottom-2.5 text-[11px] text-slate-500">
                                            Authorised signatory · {shownCompany === 'your shop' ? 'Your shop' : shownCompany}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="flex-1 min-w-[180px] m-0 text-xs text-slate-500">
                                        Draw with mouse or finger, or upload a photo of your signature or stamp.
                                    </p>
                                    <input
                                        ref={uploadRef}
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={handleUploadSignature}
                                        tabIndex={-1}
                                    />
                                    <button type="button" className={`${BTN_SECONDARY} ${BTN_SM}`} onClick={() => uploadRef.current?.click()}>
                                        <Icon name="upload" />
                                        Upload image
                                    </button>
                                    <button type="button" className={`${BTN_DANGER} ${BTN_SM}`} onClick={handleClearSignatureClick}>
                                        <Icon name="undo" />
                                        Clear
                                    </button>
                                </div>
                                {isThermalFmt && (
                                    <div className={NOTE}>
                                        <Icon name="info" />
                                        <span>Note: Signatures are not displayed on Thermal receipts.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* SECTION 5: WhatsApp message */}
                    <section className={CARD} id="bs-whatsapp">
                        <CardHeader
                            icon="whatsapp"
                            tint="green"
                            title="WhatsApp message"
                            sub="Added below the bill when you share on WhatsApp"
                            onReset={() => resetSection('bs-whatsapp')}
                        />
                        <div className={`${OPT} ${optBg(chg.whatsapp)}`}>
                            <div className={OPT_X}>
                                {chg.whatsapp && <div><ChangedTag /></div>}
                                <div>
                                    <textarea
                                        name="whatsappExtraMessage"
                                        value={settings.whatsappExtraMessage || ''}
                                        onChange={handleChange}
                                        placeholder="e.g., Thank you for shopping with us! Please leave a Google review."
                                        rows={3}
                                        className={TEXTAREA}
                                    />
                                    <div className={`text-[11px] text-right mt-1 ${waLen > 300 ? 'text-amber-700' : 'text-slate-500'}`}>{waLen} / 300</div>
                                </div>
                                <div className="grid p-3 rounded-sm bg-[#efe7de]" aria-label="Message preview">
                                    <div className="justify-self-end max-w-[280px] bg-[#dcf8c6] text-[#111b21] rounded-[10px_10px_2px_10px] px-2.5 py-2 text-xs leading-[17px] shadow-sm whitespace-pre-wrap break-words">
                                        <div className="flex items-center gap-2 bg-black/5 rounded-md px-2 py-1.5 mb-1.5 font-medium">
                                            <Icon name="doc" />
                                            Bill INV-128 · ₹1,357.60.pdf
                                        </div>
                                        Hi Priya, here is your bill from {shownCompany} for ₹1,357.60.
                                        {waMessage && (<><br /><br />{waMessage}</>)}
                                        <div className="text-right text-[10px] text-[#667781]">{nowTime} ✓✓</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* SECTION 6: Terms & conditions */}
                    <section className={CARD} id="bs-terms">
                        <CardHeader
                            icon="list"
                            title="Terms & conditions"
                            sub="Printed at the bottom of every bill"
                            onReset={() => resetSection('bs-terms')}
                        />
                        <div className={`${OPT} ${optBg(chg.terms)}`}>
                            <div className={OPT_X}>
                                {chg.terms && <div><ChangedTag /></div>}
                                <textarea
                                    name="termsAndConditions"
                                    value={settings.termsAndConditions}
                                    onChange={handleChange}
                                    rows={5}
                                    className={TEXTAREA}
                                />
                                {termsContradict && (
                                    <div className={NOTE}>
                                        <Icon name="info" />
                                        <span>
                                            Term 1 says goods won&rsquo;t be taken back, but you create sales returns in SELLAR.
                                            Consider &ldquo;Exchange within 7 days with bill.&rdquo;
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>

                {/* Live preview — right column on wide screens, last card on smaller ones */}
                <aside className="lg:col-start-2 xl:col-start-3 xl:row-start-1 xl:sticky xl:top-[84px] xl:self-start min-w-0">
                    <BillPreview
                        business={businessInfo}
                        settings={settings}
                        gstinBad={gstinBad}
                        onPrintTest={handlePrintTestBill}
                    />
                </aside>
            </div>

            {/* ── Save bar (same pattern as Sales settings) ── */}
            <div className="sticky bottom-0 z-20 mt-auto flex flex-wrap items-center gap-3 px-4 pt-2.5 pb-4 lg:px-6 lg:py-3 bg-white border-t border-indigo-100 shadow-[0_-6px_16px_rgba(21,48,140,0.06)]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${changeCount === 0 ? 'bg-green-700' : 'bg-blue-600'}`} />
                <span className="text-sm font-semibold">
                    {changeCount === 0 ? 'All changes saved' : `${changeCount} unsaved ${changeCount === 1 ? 'change' : 'changes'}`}
                </span>
                {changeCount > 0 && (
                    <span className="flex-1 basis-40 min-w-0 text-xs text-slate-500 truncate">{changeLabels.join(' · ')}</span>
                )}
                <div className="ml-auto flex gap-2">
                    <button type="button" className={BTN_GHOST} onClick={handleDiscard} disabled={changeCount === 0 || isSaving}>
                        Discard
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className={BTN_PRIMARY}>
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BillSettings;