import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { State } from "../enums";
import { FiAlertTriangle, FiX, FiCheck, FiFileText } from 'react-icons/fi';

export type PaymentTheme = 'pos' | 'catalogue';   // ← Modal ke upar move karo (neeche wala hata do)

const MODAL_THEME_STYLES = {
    pos: {
        infoBg: 'bg-blue-100',
        infoIcon: 'text-blue-600',
        primaryBtn: 'bg-blue-600 hover:bg-blue-700',
    },
    catalogue: {
        infoBg: 'bg-orange-100',
        infoIcon: 'text-[#c2410c]',
        primaryBtn: 'bg-[#c2410c] hover:bg-[#9a3412]',
    },
} as const;

interface ModalProps {
    message: string;
    onClose: () => void;
    onConfirm?: () => void;
    showConfirmButton?: boolean;
    type: State;
    theme?: PaymentTheme;   // default 'pos'
}

export const Modal: React.FC<ModalProps> = ({
    message, onClose, onConfirm, showConfirmButton = false, type, theme = 'pos',
}) => {
    const t = MODAL_THEME_STYLES[theme];
    const modalContent = (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
            <div className="bg-white rounded-sm shadow-2xl p-6 w-full max-w-sm text-center">
                {/* Icon based on type */}
                <div className={`mx-auto mb-4 w-12 h-12 rounded-sm flex items-center justify-center ${type === State.SUCCESS ? 'bg-green-100' :
                    type === State.WARNING ? 'bg-red-100' :
                        t.infoBg
                    }`}>
                    {type === State.SUCCESS && <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                    {type === State.ERROR && <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>}
                    {type === State.INFO && <svg className={`w-6 h-6 ${t.infoIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                    {type === State.WARNING && <FiAlertTriangle className="w-8 h-8 text-red-600" />}
                </div>

                <p className="text-lg font-medium text-gray-800 mb-6">{message}</p>

                {/* Conditionally render buttons based on showConfirmButton prop */}
                {showConfirmButton ? (
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-sm hover:bg-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 text-white py-2 px-4 rounded-sm transition-colors ${type === State.ERROR || type === State.INFO ? 'bg-red-600 hover:bg-red-700' : t.primaryBtn
                                }`}
                        >
                            Confirm
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={onClose}
                        className={`w-full text-white py-2 px-4 rounded-sm transition-colors ${t.primaryBtn}`}
                    >
                        OK
                    </button>
                )}
            </div>
        </div>
    );

    if (typeof document === 'undefined') return modalContent;
    return createPortal(modalContent, document.body);
};

const PAYMENT_THEME_STYLES = {
    pos: {
        primaryBtn: 'bg-blue-600 hover:bg-blue-700',
        focus: 'focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30',
        creditBox: 'bg-blue-50 border-blue-100',
        creditLabel: 'text-blue-800',
        creditAmount: 'text-blue-600',
        chip: 'bg-blue-50 text-blue-600',
        tileOn: 'border-blue-600 bg-blue-50 text-blue-700',
        cardOn: 'border-[#155dfc] shadow-[0_0_0_3px_#e6eeff]',
        checkCls: 'text-[#155dfc]',           // NEW (selected method)
    },
    catalogue: {
        primaryBtn: 'bg-[#c2410c] hover:bg-[#9a3412]',
        focus: 'focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/30',
        creditBox: 'bg-orange-50 border-orange-100',
        creditLabel: 'text-[#9a3412]',
        creditAmount: 'text-[#c2410c]',
        chip: 'bg-orange-50 text-[#c2410c]',
        tileOn: 'border-[#c2410c] bg-orange-50 text-[#9a3412]',
        cardOn: 'border-[#c2410c] shadow-[0_0_0_3px_#ffedd5]',
        checkCls: 'text-[#c2410c]',
    },
} as const;

// shared look for every input in the modal
const INPUT_CLS = 'h-10 w-full rounded-sm border border-[#7a8aa3] bg-white px-3 text-sm text-[#0f172b] placeholder:text-[#5b6b86] outline-none';
const LABEL_CLS = 'mb-1 block text-xs font-medium text-[#45556c]';

// Payment method icons/colours — same look as the payment drawer's cash / UPI / card cards
const MethodSvg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const METHOD_UI = {
    cash: {
        tint: 'bg-[#e9faef] text-[#008236]',
        icon: (<MethodSvg><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></MethodSvg>),
    },
    upi: {
        tint: 'bg-[#e6eeff] text-[#155dfc]',
        icon: (<MethodSvg><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" /></MethodSvg>),
    },
    card: {
        tint: 'bg-[#ffe8f8] text-[#c4009a]',
        icon: (<MethodSvg><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></MethodSvg>),
    },
    pdc: {
        tint: 'bg-[#fff3dd] text-[#bb4d00]',
        icon: (<MethodSvg><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></MethodSvg>),
    },
    credit: {
        tint: 'bg-[#e9faef] text-[#008236]',
        icon: (<MethodSvg><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></MethodSvg>),
    },
    debit: {
        tint: 'bg-[#ffeef0] text-[#d5000c]',
        icon: (<MethodSvg><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></MethodSvg>),
    },
    points: {
        tint: 'bg-[#fff3dd] text-[#bb4d00]',
        icon: (<MethodSvg><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" /></MethodSvg>),
    },
} as const;

export interface ModalInvoice {
    id: string;
    invoiceNumber: string;
    amount: number;
    time: string;
    status: 'Paid' | 'Unpaid';
    type: 'Debit' | 'Credit';
    partyName: string;
    createdAt: Date;
    dueAmount?: number;
    partyNumber?: string;
    items?: any[];
}

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: ModalInvoice | null;
    onSubmit: (invoice: ModalInvoice, amount: number, method: string, paymentDate: string, chequeNumber?: string, chequeDate?: string) => Promise<void>;
    onConfirm?: (amountToAdd: number) => Promise<void>;
    availableCredit?: number; // Added to receive credit from OrdersPage
    isDebitNote?: boolean;
    theme?: PaymentTheme; // 'pos' (blue, default) | 'catalogue' (orange)
    /** Online orders: offer "Loyalty Points" as a method. Omit to hide it. */
    loyalty?: { balance: number; maxPoints: number; maxValue: number; pointValue: number };
}

const LOYALTY_METHOD = 'Loyalty Points';

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, invoice, onSubmit, availableCredit = 0, isDebitNote = false, theme = 'pos', loyalty }) => {
    const t = PAYMENT_THEME_STYLES[theme];
    // method value -> amount typed (string, so the input can be empty / partial)
    const [splits, setSplits] = useState<Record<string, string>>({});
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Combines the user-selected date (YYYY-MM-DD, no time) with the CURRENT
    // time-of-day. Without this, `new Date("2026-09-15")` is parsed as UTC
    // midnight, which shows as 5:30 AM in India (UTC+5:30) regardless of
    // when the payment was actually settled.
    const getCombinedDateTime = (dateStr: string): string => {
        const now = new Date();
        const [year, month, day] = dateStr.split('-').map(Number);
        const combined = new Date(
            year,
            month - 1,
            day,
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
            now.getMilliseconds()
        );
        return combined.toISOString();
    };
    const [error, setError] = useState('');
    const [chequeNumber, setChequeNumber] = useState('');
    const [chequeDate, setChequeDate] = useState('');

    useEffect(() => {
        if (invoice) {
            // Start with the full due in Cash (same as before); user can split from here
            setSplits(invoice.dueAmount != null && invoice.dueAmount > 0 ? { cash: invoice.dueAmount.toFixed(2) } : {});
            setError('');
            setChequeNumber('');
            setChequeDate('');
            setPaymentDate(new Date().toISOString().split('T')[0]); // Reset to today when modal opens
        }
    }, [invoice]);

    if (!isOpen || !invoice) return null;

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const due = invoice.dueAmount ?? 0;
    const amountOf = (m: string) => parseFloat(splits[m] || '') || 0;
    const totalEntered = round2(Object.keys(splits).reduce((s, k) => s + amountOf(k), 0));
    const remaining = Math.max(0, round2(due - totalEntered));

    // Max one method can take on its own
    const getMethodCap = (m: string): number => {
        if (m === 'Credit Note' || m === 'Debit Note') return Math.min(due, availableCredit);
        if (m === LOYALTY_METHOD && loyalty) return Math.min(due, loyalty.maxValue);
        return due;
    };

    const handleSplitChange = (m: string, v: string) => {
        setSplits(prev => ({ ...prev, [m]: v }));
        setError('');
    };

    // Fill = current amount + whatever is still left, but not above this method's cap
    const handleFill = (m: string) => {
        const fill = Math.min(getMethodCap(m), round2(amountOf(m) + remaining));
        setSplits(prev => ({ ...prev, [m]: fill.toFixed(2) }));
        setError('');
    };

    const handleClear = (m: string) => {
        setSplits(prev => {
            const next = { ...prev };
            delete next[m];
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const entries = Object.keys(splits)
            .map(m => ({ method: m, amount: round2(amountOf(m)) }))
            .filter(en => en.amount > 0);

        if (entries.length === 0) {
            setError('Please enter a valid amount.');
            return;
        }
        if (totalEntered > due + 0.01) {
            setError('Total payment cannot exceed the due amount.');
            return;
        }

        for (const en of entries) {
            // NOTE: old code compared with 'credit Note' (lowercase) so it never matched. Fixed here.
            if ((en.method === 'Credit Note' || en.method === 'Debit Note') && en.amount > availableCredit + 0.01) {
                setError(`Cannot redeem more than available credit (₹${availableCredit.toLocaleString('en-IN')}).`);
                return;
            }
            if (en.method === LOYALTY_METHOD && loyalty) {
                if (en.amount > loyalty.maxValue + 0.01) {
                    setError(`Points can pay up to ₹${loyalty.maxValue.toLocaleString('en-IN')} (${loyalty.maxPoints} pts) on this order.`);
                    return;
                }
                if (Math.floor(en.amount / loyalty.pointValue + 1e-9) < 1) {
                    setError(`Enter at least ₹${loyalty.pointValue.toLocaleString('en-IN')} (1 point).`);
                    return;
                }
            }
        }

        const hasPdc = entries.some(en => en.method === 'PDC');
        if (hasPdc) {
            if (!chequeNumber.trim()) {
                setError('Please enter cheque number.');
                return;
            }
            if (!chequeDate) {
                setError('Please select cheque date.');
                return;
            }
        }

        if (!paymentDate) {
            setError('Please select a payment date.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        const done: string[] = [];
        try {
            const combinedDateTime = getCombinedDateTime(paymentDate);
            let runningDue = due;
            for (const en of entries) {
                // each call sees the due left after the previous method
                await onSubmit(
                    { ...invoice, dueAmount: runningDue },
                    en.amount,
                    en.method,
                    combinedDateTime,
                    en.method === 'PDC' ? chequeNumber : undefined,
                    en.method === 'PDC' ? chequeDate : undefined
                );
                runningDue = round2(runningDue - en.amount);
                done.push(en.method);
            }
            onClose();
        } catch (err) {
            console.error(err);
            // keep only the methods that did NOT get saved, so a retry doesn't double-pay
            setSplits(prev => {
                const next = { ...prev };
                done.forEach(k => delete next[k]);
                return next;
            });
            setError(
                done.length > 0
                    ? `Saved: ${done.join(', ')}. The rest failed, please try again.`
                    : 'Failed to process payment. Please try again.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    // Portaled like Modal so it always sits above page sheets/drawers that opened it
    return createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#020618]/50 p-4">
            <div role="dialog" aria-label="Settle payment" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-sm bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]">
                <div className="flex flex-none items-center gap-3 border-b border-[#dfe6fb] px-4 py-3.5">
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-sm ${t.chip}`}>
                        <FiCheck size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[15px] font-semibold leading-snug text-[#0f172b]">Settle payment</h2>
                        <p className="truncate text-xs text-[#5b6b86]">For {invoice.partyName}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]">
                        <FiX size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
                        <div className="flex items-baseline justify-between rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] px-4 py-3">
                            <span className="text-sm text-[#45556c]">Amount due</span>
                            <span className="text-2xl font-semibold tracking-tight text-[#0f172b] tabular-nums">
                                ₹{(invoice.dueAmount ?? 0).toLocaleString('en-IN')}
                            </span>
                        </div>

                        {availableCredit > 0 && (
                            <div className={`flex items-center justify-between rounded-sm border px-4 py-2.5 ${t.creditBox}`}>
                                <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${t.creditLabel}`}>
                                    {isDebitNote ? 'Available Debit' : 'Available Credit'}
                                </span>
                                <span className={`text-sm font-semibold tabular-nums ${t.creditAmount}`}>₹{availableCredit.toLocaleString('en-IN')}</span>
                            </div>
                        )}
                        <div className="min-w-0">
                            <label htmlFor="paymentDate" className={LABEL_CLS}>Payment date</label>
                            <input
                                type="date"
                                id="paymentDate"
                                value={paymentDate}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                className={`${INPUT_CLS} min-w-0 ${t.focus}`}
                                required
                            />
                        </div>

                        <div className="flex items-baseline justify-between text-[13px]">
                            <span className="text-[#45556c]">
                                Entered <b className="text-[#0f172b] tabular-nums">₹{totalEntered.toLocaleString('en-IN')}</b>
                            </span>
                            {totalEntered > due + 0.01 ? (
                                <span className="font-semibold text-[#d5000c]">Over by ₹{round2(totalEntered - due).toLocaleString('en-IN')}</span>
                            ) : remaining > 0 ? (
                                <span className="text-[#45556c]">Left <b className="text-[#bb4d00] tabular-nums">₹{remaining.toLocaleString('en-IN')}</b></span>
                            ) : (
                                <b className="text-[#008236]">Fully settled</b>
                            )}
                        </div>
                        {(() => {
                            const methods = [
                                { value: 'cash', label: 'Cash', ui: METHOD_UI.cash },
                                { value: 'upi', label: 'UPI', ui: METHOD_UI.upi },
                                { value: 'card', label: 'Card', ui: METHOD_UI.card },
                                { value: 'PDC', label: 'PDC', ui: METHOD_UI.pdc },
                                ...(availableCredit > 0
                                    ? [{
                                        value: isDebitNote ? 'Debit Note' : 'Credit Note',
                                        label: isDebitNote ? 'Debit Note' : 'Credit Note',
                                        ui: isDebitNote ? METHOD_UI.debit : METHOD_UI.credit,
                                    }]
                                    : []),
                                ...(loyalty && loyalty.maxPoints > 0
                                    ? [{ value: LOYALTY_METHOD, label: 'Points', ui: METHOD_UI.points }]
                                    : []),
                            ];
                            return (
                                <div>
                                    <span className="mb-1.5 block text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#5b6b86]">Payment method</span>
                                    <div role="group" aria-label="Payment method" className="grid grid-cols-2 gap-2">
                                        {methods.map((m) => {
                                            const val = splits[m.value] ?? '';
                                            const cur = amountOf(m.value);
                                            const on = cur > 0;
                                            const fillTarget = Math.min(getMethodCap(m.value), round2(cur + remaining));
                                            const canFill = fillTarget > cur + 0.005;
                                            return (
                                                <div
                                                    key={m.value}
                                                    className={`flex min-w-0 flex-col gap-2 rounded-sm border p-2.5 transition-shadow ${on
                                                        ? `bg-white ${t.cardOn}`
                                                        : 'border-[#dfe6fb] bg-white focus-within:bg-[#f5f7ff]'
                                                        }`}
                                                >
                                                    <label htmlFor={`split-${m.value}`} className="flex min-w-0 cursor-pointer items-center gap-2">
                                                        <span className={`grid h-8 w-8 flex-none place-items-center rounded-sm ${m.ui.tint}`}>{m.ui.icon}</span>
                                                        <span className="flex-1 truncate text-sm font-medium text-[#0f172b]">{m.label}</span>
                                                    </label>

                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-sm border border-[#7a8aa3] bg-white px-2.5">
                                                            <i className="not-italic text-sm text-[#5b6b86]">₹</i>
                                                            <input
                                                                id={`split-${m.value}`}
                                                                type="number"
                                                                inputMode="decimal"
                                                                step="any"
                                                                placeholder="0"
                                                                value={val}
                                                                onChange={(e) => handleSplitChange(m.value, e.target.value)}
                                                                className="w-full min-w-0 bg-transparent text-right text-sm font-semibold tabular-nums text-[#0f172b] outline-none placeholder:font-normal placeholder:text-[#5b6b86] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                            />
                                                        </div>

                                                        {canFill ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFill(m.value)}
                                                                className="h-10 flex-none whitespace-nowrap rounded-sm border border-[#7a8aa3] bg-white px-2.5 text-[13px] font-medium text-[#0f172b] transition-colors hover:bg-[#f5f7ff]"
                                                            >
                                                                Fill
                                                            </button>
                                                        ) : on ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleClear(m.value)}
                                                                aria-label={`Clear ${m.label}`}
                                                                className="grid h-10 w-10 flex-none place-items-center rounded-sm border border-[#7a8aa3] bg-white text-[#45556c] transition-colors hover:bg-[#f5f7ff] hover:text-[#0f172b]"
                                                            >
                                                                <FiX size={16} />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {amountOf(LOYALTY_METHOD) > 0 && loyalty && (
                                        <p className="mt-2 text-xs text-[#5b6b86]">
                                            {loyalty.balance} pts available · up to {loyalty.maxPoints} pts (₹{loyalty.maxValue.toLocaleString('en-IN')}) on this order. 1 pt = ₹{loyalty.pointValue.toLocaleString('en-IN')}; amounts round down to whole points.
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                        {amountOf('PDC') > 0 && (
                            <div className="grid gap-3 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">Cheque details</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={LABEL_CLS}>Cheque number</label>
                                        <input
                                            type="text"
                                            value={chequeNumber}
                                            onChange={(e) => setChequeNumber(e.target.value)}
                                            className={`${INPUT_CLS} ${t.focus}`}
                                            placeholder="Enter number"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className={LABEL_CLS}>Cheque date</label>
                                        <input
                                            type="date"
                                            value={chequeDate}
                                            onChange={(e) => setChequeDate(e.target.value)}
                                            className={`${INPUT_CLS} ${t.focus}`}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        {error && (
                            <div role="alert" className="flex items-start gap-2 rounded-sm bg-[#ffeef0] px-3 py-2.5 text-[13px] text-[#d5000c]">
                                <FiAlertTriangle size={16} className="mt-0.5 flex-none" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-none items-center justify-end gap-2 border-t border-[#dfe6fb] bg-white px-4 py-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-10 rounded-sm px-4 text-sm font-medium text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`inline-flex h-10 items-center gap-2 rounded-sm px-4 text-sm font-medium text-white disabled:opacity-50 ${t.primaryBtn}`}
                        >
                            <FiCheck size={16} />
                            {isSubmitting ? 'Processing...' : 'Submit payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
};

// ─── Edit PDC cheque details (number + date only; amount/method untouched) ───
export interface PdcEditPayload {
    chequeNumber: string;
    chequeDate: string;
}

interface PdcEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    partyName?: string;
    initialChequeNumber: string;
    initialChequeDate: string;
    onSubmit: (data: PdcEditPayload) => Promise<void>;
    theme?: PaymentTheme;
}

export const PdcEditModal: React.FC<PdcEditModalProps> = ({
    isOpen, onClose, partyName, initialChequeNumber, initialChequeDate, onSubmit, theme = 'pos',
}) => {
    const t = PAYMENT_THEME_STYLES[theme];
    const [chequeNumber, setChequeNumber] = useState('');
    const [chequeDate, setChequeDate] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setChequeNumber(initialChequeNumber || '');
            setChequeDate(initialChequeDate || '');
            setError('');
        }
    }, [isOpen, initialChequeNumber, initialChequeDate]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chequeNumber.trim()) {
            setError('Please enter cheque number.');
            return;
        }
        if (!chequeDate) {
            setError('Please select cheque date.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await onSubmit({ chequeNumber: chequeNumber.trim(), chequeDate });
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to update cheque details. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#020618]/50 p-4">
            <div role="dialog" aria-label="Edit cheque details" className="flex w-full max-w-md flex-col overflow-hidden rounded-sm bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]">
                <div className="flex items-center gap-3 border-b border-[#dfe6fb] px-4 py-3.5">
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-sm ${t.chip}`}>
                        <FiFileText size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[15px] font-semibold leading-snug text-[#0f172b]">Edit cheque details</h2>
                        {partyName && <p className="truncate text-xs text-[#5b6b86]">For {partyName}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]">
                        <FiX size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 p-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={LABEL_CLS}>Cheque number</label>
                                <input
                                    type="text"
                                    value={chequeNumber}
                                    onChange={(e) => setChequeNumber(e.target.value)}
                                    className={`${INPUT_CLS} ${t.focus}`}
                                    placeholder="Enter number"
                                    required
                                />
                            </div>
                            <div>
                                <label className={LABEL_CLS}>Cheque date</label>
                                <input
                                    type="date"
                                    value={chequeDate}
                                    onChange={(e) => setChequeDate(e.target.value)}
                                    className={`${INPUT_CLS} ${t.focus}`}
                                    required
                                />
                            </div>
                        </div>
                        {error && (
                            <div role="alert" className="flex items-start gap-2 rounded-sm bg-[#ffeef0] px-3 py-2.5 text-[13px] text-[#d5000c]">
                                <FiAlertTriangle size={16} className="mt-0.5 flex-none" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-[#dfe6fb] px-4 py-3">
                        <button type="button" onClick={onClose} className="h-10 rounded-sm px-4 text-sm font-medium text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`inline-flex h-10 items-center gap-2 rounded-sm px-4 text-sm font-medium text-white disabled:opacity-50 ${t.primaryBtn}`}
                        >
                            <FiCheck size={16} />
                            {isSubmitting ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
};