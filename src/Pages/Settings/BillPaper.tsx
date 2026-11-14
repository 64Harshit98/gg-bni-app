import React, { useLayoutEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

// Sample bill drawn with the same layouts as the real printed bills. Used by the
// Bill settings preview and the bill slideshow on the sign-up business details page.

export interface BillSettingsData {
    upiId?: string;
    termsAndConditions: string;
    signatureBase64?: string;
    printFormat?: 'A4' | 'A5' | 'THERMAL58' | 'THERMAL80';
    whatsappExtraMessage?: string;
    enableTriplicate?: boolean;
    discountDisplayFormat?: 'amount' | 'percentage';
    enableItemImages?: boolean;
    enableWatermark?: boolean;
}

export const DEFAULT_TERMS_AND_CONDITIONS =
    '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.';

export interface BusinessInfoData {
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

// ───── Real bill preview helpers ─────
export const PAPER_W = { A4: 794, A5: 559, THERMAL80: 302, THERMAL58: 219 } as const; // px @96dpi = real mm

const SAMPLE_ITEMS = [
    { name: 'Cotton shirt', qty: 1, rate: 1000, disc: 100, pct: '10%', amount: 900 },
    { name: 'Denim jeans', qty: 1, rate: 499, disc: 41, pct: '8%', amount: 458 },
];
export const SAMPLE_TOTAL = 1358;

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Standard UPI deep-link; any UPI app scans this
export const buildUpiUrl = (upiId: string, payee: string, amount: number) =>
    `upi://pay?pa=${upiId.trim()}&pn=${encodeURIComponent(payee)}&am=${amount.toFixed(2)}&cu=INR`;

// ───── Scales a fixed-size paper down to fit the preview column ─────
export const ScaledPaper: React.FC<{ width: number; children: React.ReactNode }> = ({ width, children }) => {
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

export const BillPaper: React.FC<{ business: BusinessInfoData; settings: BillSettingsData; gstinBad?: boolean; title?: string }> = ({
    business, settings, gstinBad, title = 'BILL OF SUPPLY',
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
    // Default ON: only an explicit `false` hides the watermark (matches the PDF generators).
    const showWatermark = settings.enableWatermark !== false;

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
                {business.gstin && <div className="text-center">GSTIN: {business.gstin}</div>}
                <div className="text-center font-bold mt-1">{title}</div>
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
                {showWatermark && <div className={WM}>SELLAR.IN</div>}
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
            {showWatermark && <div className={WM}>SELLAR.IN</div>}
            <div className="text-right text-[9px]">Bill generated on {today}</div>
            <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 p-2 border border-black">
                <div>{qr}</div>
                <div className="text-center">
                    <div className="font-bold text-[13px]">{title}</div>
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
