import React from 'react';
import { motion } from "framer-motion";
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiChevronRight, FiMessageCircle, FiPhone } from 'react-icons/fi';
import { ROUTES } from '../../../constants/routes.constants';
import { CustomCard } from '../../../Components/CustomCard';
import { Spinner } from '../../../constants/Spinner';
import { IconEdit } from '../../../constants/Icons';
import { useWhatsappProvider } from '../../../Pages/Additional/Whatsapp/useWhatsappProvider';
import type { Order, OrderStatus } from '../orders.types';
import { formatAmount } from '../../../lib/format';

interface OrderCardProps {
    order: Order;
    expandedorderId: string | null;
    handleOrderClick: (uiKey: string) => void;
    openEditor: (order: Order) => void;
    setSelectedOrderForAction: (order: Order | null) => void;
    pdfLoadingOrderId: string | null;
    handleSendReminder: (order: Order) => void;
    handleSendReminderSnapto: (order: Order) => void;
    companyId: string | undefined;
    sendingPdf: boolean;
    handleDeleteOrder: (orderId: string, skipConfirm?: boolean) => void;
    setShowPaymentModal: (order: Order | null) => void;
    handlePreviousStatus: (orderId: string, currentStatus: OrderStatus) => void;
    handleUpdateStatus: (orderId: string, currentStatus: OrderStatus, manualNextStatus?: OrderStatus) => void;
    isUpdatingStatus: string | null;
    // accordion → compact mobile card (tap opens the full-screen 'screen' view)
    // row       → desktop list row
    // detail    → desktop right pane
    // screen    → mobile full-screen order view (header + cards + pinned actions)
    variant?: 'accordion' | 'row' | 'detail' | 'screen';
}

// ─── UI-only style tokens (SELLAR orders design) ────────────────────────────
const BTN = 'min-h-[40px] px-3 rounded-sm text-xs font-semibold transition active:scale-[0.97] flex items-center justify-center gap-1.5 flex-1 sm:flex-none sm:min-w-[96px] disabled:opacity-50';
const BTN_PRIMARY = `${BTN} bg-[#c2410c] hover:bg-[#9a3412] text-white sm:min-w-[130px] sm:ml-auto`;
const STAGES = ['Upcoming', 'Confirmed', 'Packed', 'Completed'] as const;
const BTN_SECONDARY = `${BTN} bg-white border border-[#f6e1d0] text-slate-800 hover:bg-[#fff8f2]`;
const BTN_DANGER = `${BTN} bg-white border border-red-200 text-red-600 hover:bg-red-50`;
const BTN_SUCCESS = `${BTN} bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100`;
const BTN_WARN = `${BTN} bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100`;
const BTN_GHOST = `${BTN} bg-transparent text-slate-600 hover:bg-[#fff8f2]`;
const OVERLINE = 'text-[10px] font-semibold uppercase tracking-wider text-[#9a3412]';
// compact mobile card icon buttons (Call / WhatsApp)
const ICON_BTN = 'w-10 h-10 rounded-sm grid place-items-center transition active:scale-[0.97]';
const ICON_BTN_SECONDARY = `${ICON_BTN} bg-white border border-[#f6e1d0] text-slate-800 hover:bg-[#fff8f2]`;
const ICON_BTN_SUCCESS = `${ICON_BTN} bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100`;
// white surface card used on the mobile full-screen view
const SCREEN_CARD = 'bg-white border border-[#f6e1d0] rounded-sm shadow-sm p-4';

export const OrderCard: React.FC<OrderCardProps> = ({
    order: Order,
    expandedorderId,
    handleOrderClick,
    openEditor,
    setSelectedOrderForAction,
    pdfLoadingOrderId,
    handleSendReminder,
    handleSendReminderSnapto,
    companyId,
    sendingPdf,
    handleDeleteOrder,
    setShowPaymentModal,
    handlePreviousStatus,
    handleUpdateStatus,
    isUpdatingStatus,
    variant = 'accordion',
}) => {
    const navigate = useNavigate();
    const { provider: whatsappProvider } = useWhatsappProvider(companyId);

    const returnMethods =
        Order.returnHistory && Order.returnHistory.length > 0
            ? Array.from(
                new Set(
                    Order.returnHistory.map(r => r.modeOfReturn)
                )) : [];
    const isSelected = expandedorderId === Order.id;
    const isUpcomingStatus = Order.status === 'Upcoming';

    // Total is read from the order document as saved at checkout/edit time —
    // never recomputed from the company's *current* tax settings, so this
    // can't drift from what the bill actually said when it was created.
    const total = Number(Order.totalAmount) || 0;

    // Tax only ever applies under a Regular GST scheme with Inclusive/Exclusive
    // tax — never under Composition or Exempt/None, where GST isn't charged at
    // all. Orders without a persisted gstScheme (older orders, saved before
    // that field existed) fall back to showing tax whenever a nonzero amount
    // was recorded, since we can't tell what scheme was actually in effect.
    const orderGstScheme = (Order.gstScheme || '').toLowerCase();
    const orderTaxType = (Order.taxType || '').toLowerCase();
    const isTaxableScheme = Order.gstScheme
        ? (orderGstScheme === 'regular' && (orderTaxType === 'inclusive' || orderTaxType === 'exclusive'))
        : true;
    const showTaxRow = isTaxableScheme && Number(Order.totalTax || 0) > 0;

    let paid = Number(Order.paidAmount || 0);
    let due = Math.max(0, total - paid);
    const isPaid = Order.status === 'Paid';
    const isFinalStage = Order.status === 'Completed' || Order.status === 'Paid';

    // --- FIX: Ghost Due Amount on Returned Orders ---
    if (isPaid) {
        due = 0;
        paid = total;
    }
    // ------------------------------------------------

    // UI-only derived values
    const avatarLetter = String(Order.userName || '?').trim().charAt(0).toUpperCase() || '?';
    const itemCount = Order.items?.length || 0;
    const hasRefund = Number(Order.refundAmount || 0) > 0;
    const stageIndex = isFinalStage ? 3 : Order.status === 'Packed' ? 2 : Order.status === 'Confirmed' ? 1 : 0;

    // Payment-method labels (original payments + latest return payment) — used for the PAID · UPI badge
    const paymentMethodLabels = (() => {
        const seen = new Set<string>();

        if (Order.paymentMethods) {
            Object.entries(Order.paymentMethods).forEach(([method, amount]) => {
                if (method.toLowerCase() !== 'due' && Number(amount) > 0) {
                    seen.add(method.trim().toUpperCase());
                }
            });
        }

        const latestReturn = Order.returnHistory?.[Order.returnHistory.length - 1];
        if (latestReturn?.paymentDetails) {
            Object.entries(latestReturn.paymentDetails).forEach(([method, amount]) => {
                if (method.toLowerCase() !== 'due' && Number(amount) > 0) {
                    seen.add(method.trim().toUpperCase());
                }
            });
        }

        return Array.from(seen);
    })();

    const paidBadgeText = paymentMethodLabels.length > 0 ? `PAID · ${paymentMethodLabels.join(' + ')}` : 'PAID';

    // ─────────────────────────────────────────────────────────────────────────
    // DESKTOP LIST ROW
    // ─────────────────────────────────────────────────────────────────────────
    if (variant === 'row') {
        return (
            <div
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => handleOrderClick(Order.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleOrderClick(Order.id); }}
                className={`grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-center px-4 py-3.5 border-b border-[#f6e1d0] last:border-b-0 cursor-pointer transition ${isSelected
                    ? 'bg-[#ffedd5] shadow-[inset_3px_0_0_#c2410c]'
                    : 'hover:bg-[#fff8f2]'}`}
            >
                <span className="row-span-2 w-9 h-9 rounded-full grid place-items-center bg-[#fff8f2] text-slate-600 font-semibold text-[13px]">
                    {avatarLetter}
                </span>
                <b className="text-sm font-semibold text-slate-900 truncate">{Order.userName}</b>
                <span className="text-sm font-semibold text-slate-900 tabular-nums text-right">₹{formatAmount(total)}</span>
                <span className="text-xs text-slate-500 truncate">
                    {!isUpcomingStatus && `${Order.orderId} · `}{Order.time} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
                {isUpcomingStatus ? (
                    <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-[#f97316] text-white justify-self-end">NEW</span>
                ) : due > 0 ? (
                    <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-[#fef6d7] text-[#a16207] justify-self-end">UNPAID</span>
                ) : (
                    <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 justify-self-end">PAID</span>
                )}
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHARED PIECES (used by 'detail' on desktop and 'screen' on mobile)
    // ─────────────────────────────────────────────────────────────────────────

    // Progress track: Upcoming → Confirmed → Packed → Completed
    const trackEl = !isUpcomingStatus && (
        <div className="grid grid-cols-4">
            {STAGES.map((s, i) => {
                const on = i <= stageIndex;
                return (
                    <div key={s} className="relative pt-[18px] text-[10px] sm:text-xs text-slate-500">
                        <span className={`absolute top-1 left-0 right-0 h-[3px] ${on ? 'bg-[#c2410c]' : 'bg-[#f6e1d0]'}`} />
                        <span className={`absolute top-0 left-0 w-[11px] h-[11px] rounded-full border-2 ${on ? 'bg-[#c2410c] border-[#c2410c]' : 'bg-white border-[#f6e1d0]'} ${i === stageIndex ? 'ring-4 ring-[#ffedd5]' : ''}`} />
                        <b className="block text-xs sm:text-[13px] font-semibold text-slate-900">{s}</b>
                        {i === 0 ? Order.time : i === stageIndex + 1 ? 'Next' : on ? '' : '—'}
                    </div>
                );
            })}
        </div>
    );

    // Billing + Shipping
    const addressesEl = !isUpcomingStatus && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 border border-[#f6e1d0] rounded-sm space-y-0.5">
                <p className={OVERLINE}>Billing address</p>
                <p className="text-[13px] font-semibold text-slate-900">{Order.billingDetails?.name}</p>
                <p className="text-xs text-slate-600 leading-snug">{Order.billingDetails?.address}</p>
                {(Order.billingDetails?.city || Order.billingDetails?.state) && (
                    <p className="text-xs text-slate-600 leading-snug">
                        {[Order.billingDetails?.city, Order.billingDetails?.state].filter(Boolean).join(', ')}
                    </p>
                )}
                <p className="text-xs text-slate-600">{Order.billingDetails?.phone}</p>
            </div>
            <div className="p-3 border border-[#f6e1d0] rounded-sm space-y-0.5">
                <p className={OVERLINE}>Shipping address</p>
                <p className="text-[13px] font-semibold text-slate-900">{Order.shippingDetails?.name || Order.billingDetails?.name}</p>
                <p className="text-xs text-slate-600 leading-snug">{Order.shippingDetails?.address || Order.billingDetails?.address}</p>
                {(Order.shippingDetails?.city || Order.shippingDetails?.state || Order.billingDetails?.city || Order.billingDetails?.state) && (
                    <p className="text-xs text-slate-600 leading-snug">
                        {[
                            Order.shippingDetails?.city || Order.billingDetails?.city,
                            Order.shippingDetails?.state || Order.billingDetails?.state
                        ].filter(Boolean).join(', ')}
                    </p>
                )}
                <p className="text-xs text-slate-600">{Order.shippingDetails?.phone}</p>
            </div>
        </div>
    );

    // Special instructions + Items list + Expenses / Tax / Bill discount
    const itemsEl = (
        <div>
            {Order.specialInstruction && (
                <div className="mb-3 bg-[#fef6d7] border border-[#f3e3a0] rounded-sm p-3">
                    <p className="text-[10px] font-semibold text-[#a16207] uppercase tracking-wider mb-1">
                        Special instructions
                    </p>
                    <p className="text-xs text-slate-800 font-medium leading-snug break-words">
                        {Order.specialInstruction}
                    </p>
                </div>
            )}

            <p className={`${OVERLINE} mb-1`}>Items</p>
            <div className="divide-y divide-[#f6e1d0] border-y border-[#f6e1d0]">
                {Order.items?.map((item, idx) => {
                    const returnedEntries: { qty: number; modeOfReturn: string; returnedAt: any; unitPrice: number }[] = [];
                    (Order.returnHistory || []).forEach((h: any) => {
                        (h.returnedItems || []).forEach((r: any) => {
                            const matches =
                                String(r.originalItemId) === String(item.itemId) ||
                                String(r.originalItemId) === String(item.id) ||
                                String(r.id) === String(item.itemId) ||
                                String(r.id) === String(item.id);
                            if (matches) {
                                returnedEntries.push({
                                    qty: Number(r.quantity || 0),
                                    modeOfReturn: h.modeOfReturn || '',
                                    returnedAt: h.returnedAt,
                                    unitPrice: Number(r.effectiveUnitPrice ?? r.customPrice ?? r.salesPrice ?? r.mrp ?? 0),
                                });
                            }
                        });
                    });
                    const totalReturnedFromHistory = returnedEntries.reduce((sum, e) => sum + e.qty, 0);
                    const originalQty = Number(item.quantity || 0) + totalReturnedFromHistory;
                    const remainingQty = originalQty - totalReturnedFromHistory;

                    // Extract Base Price for UI Math
                    const rawUnitPrice = Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
                    // Tax rate/type as saved on the item at checkout/edit time — not gated
                    // by the company's current tax toggle, which may have changed since.
                    const taxRate = Number(item.tax ?? item.taxRate ?? 0);
                    const taxType = (item.taxType || '').toLowerCase();

                    let displayUnitPrice = rawUnitPrice;

                    // If tax is inclusive, reverse-calculate the base price so the UI math adds up with the "+Tax" row
                    if (taxRate > 0 && taxType === 'inclusive') {
                        displayUnitPrice = rawUnitPrice / (1 + (taxRate / 100));
                    }

                    const displayLineTotal = displayUnitPrice * remainingQty;
                    // --------------------------------------------------

                    return (
                        <div key={idx} className="py-2.5">
                            {/* REMAINING QUANTITY ROW */}
                            {remainingQty > 0 && (
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium leading-tight text-slate-900">
                                            {item.name}
                                            <span className="ml-1 text-[11px] font-normal text-slate-500">
                                                {item.unit || "pcs"}
                                            </span>
                                        </p>
                                        {item.note && (
                                            <p className="text-[11px] leading-tight flex items-baseline gap-1.5 mt-1">
                                                <span className="font-semibold uppercase tracking-wider text-slate-500">Note:</span>
                                                <span className="italic text-slate-600">{item.note}</span>
                                            </p>
                                        )}
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            ₹{formatAmount(displayUnitPrice)} per {item.unit || "pcs"}
                                        </p>
                                    </div>
                                    <div className="text-right ml-4">
                                        <p className="text-[13px] font-semibold text-slate-900 tabular-nums">
                                            ₹{formatAmount(displayLineTotal)}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            Qty: {remainingQty}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* RETURNED ENTRIES — one crossed-out row per return event */}
                            {returnedEntries.map((entry, rIdx) => {
                                let retDisplayUnitPrice = entry.unitPrice;
                                if (taxRate > 0 && taxType === 'inclusive') {
                                    retDisplayUnitPrice = entry.unitPrice / (1 + (taxRate / 100));
                                }
                                const retDisplayLineTotal = retDisplayUnitPrice * entry.qty;

                                return entry.qty > 0 && (
                                    <div key={rIdx} className="flex justify-between items-start mt-1.5">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium leading-tight line-through text-slate-400">
                                                {item.name}
                                                <span className="ml-1 text-[11px] font-normal">
                                                    {item.unit || "pcs"}
                                                </span>
                                            </p>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                {entry.modeOfReturn && (
                                                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full border ${entry.modeOfReturn.toUpperCase() === 'EXCHANGE'
                                                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                        : entry.modeOfReturn.toUpperCase().includes('CASH') || entry.modeOfReturn.toUpperCase().includes('REFUND')
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : 'bg-orange-50 text-[#F97316] border-orange-200'
                                                        }`}>
                                                        {entry.modeOfReturn}
                                                    </span>
                                                )}
                                                {entry.returnedAt && (
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                                        {new Date(
                                                            entry.returnedAt?.toDate
                                                                ? entry.returnedAt.toDate()
                                                                : entry.returnedAt
                                                        ).toLocaleDateString('en-GB', {
                                                            day: '2-digit', month: 'short', year: '2-digit'
                                                        })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right ml-4">
                                            <p className="text-[13px] font-semibold line-through text-slate-400 tabular-nums">
                                                ₹{formatAmount(retDisplayLineTotal)}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                Qty: {entry.qty}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    );
                })}

                {/* Show fully removed returned items */}
                {Order.returnHistory?.flatMap((h: any) => h.returnedItems || [])
                    .filter((r: any) => !Order.items?.some(item =>
                        String(item.itemId) === String(r.originalItemId) ||
                        String(item.id) === String(r.originalItemId)
                    ))
                    .map((r: any, idx: number) => (
                        <div key={`removed-${idx}`} className="py-2.5">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium leading-tight line-through text-slate-400">
                                        {r.name}
                                        <span className="ml-1 text-[11px] font-normal">
                                            {r.unit || "pcs"}
                                        </span>
                                    </p>
                                    {/* Return mode badge + date */}
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        {(() => {
                                            const matchedHistory = Order.returnHistory?.find((h: any) =>
                                                h.returnedItems?.some((ri: any) =>
                                                    String(ri.originalItemId) === String(r.originalItemId) ||
                                                    String(ri.id) === String(r.originalItemId)
                                                )
                                            );
                                            return (
                                                <>
                                                    {matchedHistory?.modeOfReturn && (
                                                        <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full border ${matchedHistory.modeOfReturn === 'EXCHANGE'
                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                            : matchedHistory.modeOfReturn === 'CASH REFUND'
                                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                                : 'bg-orange-50 text-[#F97316] border-orange-200'
                                                            }`}>
                                                            {matchedHistory.modeOfReturn}
                                                        </span>
                                                    )}
                                                    {matchedHistory?.returnedAt && (
                                                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                                            {new Date(
                                                                (matchedHistory.returnedAt as any)?.toDate
                                                                    ? (matchedHistory.returnedAt as any).toDate()
                                                                    : matchedHistory.returnedAt
                                                            ).toLocaleDateString('en-GB', {
                                                                day: '2-digit', month: 'short', year: '2-digit'
                                                            })}
                                                        </span>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    {r.note && (
                                        <p className="text-[11px] leading-tight flex items-baseline gap-1.5 mt-1">
                                            <span className="font-semibold uppercase tracking-wider text-slate-400">Note:</span>
                                            <span className="italic text-slate-400">{r.note}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="text-right ml-4">
                                    <p className="text-[13px] font-semibold line-through text-slate-400 tabular-nums">
                                        ₹{formatAmount((r.effectiveUnitPrice ?? r.customPrice ?? r.salesPrice ?? r.mrp ?? 0)
                                            * r.quantity)}
                                    </p>
                                    <p className="text-xs text-slate-400">Qty: {r.quantity}</p>
                                </div>
                            </div>
                        </div>
                    ))
                }
            </div>

            {/* Expenses, tax & discount (saved on order) */}
            {!isUpcomingStatus && (
                <div className="pt-2 space-y-1">
                    {Array.isArray(Order.expenses) && Order.expenses.length > 0 && (
                        <>
                            {Order.expenses.map((ex, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">{ex.name || 'Expense'}</span>
                                    <span className="font-semibold text-slate-800 tabular-nums">
                                        +₹{formatAmount(parseFloat(String(ex.amount)) || 0)}
                                    </span>
                                </div>
                            ))}
                        </>
                    )}
                    {showTaxRow && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Tax</span>
                            <span className="font-semibold text-slate-800 tabular-nums">
                                +₹{formatAmount(Number(Order.totalTax))}
                            </span>
                        </div>
                    )}
                    {Number(Order.manualDiscount || 0) > 0 && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Bill discount</span>
                            <span className="font-semibold text-red-600 tabular-nums">
                                -₹{formatAmount(Number(Order.manualDiscount))}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // Payment chips + Paid / Credit note / Refund / Due grid
    const totalsEl = !isUpcomingStatus && (
        <div className="space-y-2">
            {paid > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center empty:hidden">
                    {(() => {
                        // Merge all payment sources into one map
                        const mergedMethods: Record<string, number> = {};

                        if (Order.paymentMethods && Object.keys(Order.paymentMethods).length > 0) {
                            Object.entries(Order.paymentMethods).forEach(([method, amount]) => {
                                if (method.toLowerCase() !== 'due' && Number(amount) > 0) {
                                    const key = method.trim().toUpperCase();
                                    mergedMethods[key] = (mergedMethods[key] || 0) + Number(amount);
                                }
                            });
                        } else if (Order.paymentMethod && paid > 0) {
                            mergedMethods[Order.paymentMethod.trim().toUpperCase()] = paid;
                        }
                        return Object.entries(mergedMethods).map(([method, amount]) => (
                            <div
                                key={method}
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100"
                            >
                                <span className="text-[11px] font-semibold text-emerald-800 uppercase">
                                    {method}
                                </span>
                                <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                                    ₹{Number(amount).toFixed(2)}
                                </span>
                            </div>
                        ));
                    })()}
                </div>
            )}

            <div className={`grid ${hasRefund ? 'grid-cols-4' : 'grid-cols-3'} border border-[#f6e1d0] rounded-sm overflow-hidden`}>
                <div className="px-3 py-2 border-r border-[#f6e1d0]">
                    <p className="text-[11px] text-slate-500">Paid</p>
                    <p className="text-sm font-semibold text-emerald-700 tabular-nums">₹{paid.toFixed(2)}</p>
                </div>
                <div className="px-3 py-2 border-r border-[#f6e1d0]">
                    <p className="text-[11px] text-slate-500">Credit note</p>
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">
                        ₹{Number(Order.creditNoteAmount || 0).toFixed(2)}
                    </p>
                </div>
                {hasRefund && (
                    <div className="px-3 py-2 border-r border-[#f6e1d0]">
                        <p className="text-[11px] text-slate-500">Refund</p>
                        <p className="text-sm font-semibold text-red-600 tabular-nums">
                            ₹{Number(Order.refundAmount || 0).toFixed(2)}
                        </p>
                    </div>
                )}
                <div className={`px-3 py-2 ${due > 0 ? 'bg-[#fef6d7]' : ''}`}>
                    <p className="text-[11px] text-slate-500">Due</p>
                    <p className={`text-sm font-semibold tabular-nums ${due > 0 ? 'text-[#a16207]' : 'text-slate-800'}`}>₹{due.toFixed(2)}</p>
                </div>
            </div>
        </div>
    );

    // ACTION BUTTONS (same buttons, same conditions)
    const actionButtons = (
        <>
            {/* UPCOMING STAGE BUTTONS */}
            {isUpcomingStatus && Order.userLoginPhone && (
                <>
                    <a
                        href={`tel:${Order.userLoginPhone.replace(/\D/g, '')}`}
                        onClick={(e) => e.stopPropagation()}
                        className={BTN_SECONDARY}
                    >
                        Call
                    </a>

                    <a
                        href={`https://wa.me/${Order.userLoginPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={BTN_SUCCESS}
                    >
                        WhatsApp
                    </a>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderForAction(Order);
                        }}
                        disabled={pdfLoadingOrderId === Order.id}
                        className={BTN_SECONDARY}
                    >
                        {pdfLoadingOrderId === Order.id ? <Spinner /> : "Print"}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(Order.id);
                        }}
                        className={BTN_DANGER}
                    >
                        Delete
                    </button>
                </>
            )}
            {/* Fallback for upcoming/lead orders that have no phone captured yet —
                still let the seller print/download the bill */}
            {isUpcomingStatus && !Order.userLoginPhone && (
                <>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderForAction(Order);
                        }}
                        disabled={pdfLoadingOrderId === Order.id}
                        className={BTN_SECONDARY}
                    >
                        {pdfLoadingOrderId === Order.id ? <Spinner /> : "Print"}
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(Order.id);
                        }}
                        className={BTN_DANGER}
                    >
                        Delete
                    </button>
                </>
            )}
            {!isUpcomingStatus && (isFinalStage ? (
                <>
                    {/* PRINT */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderForAction(Order);
                        }}
                        disabled={pdfLoadingOrderId === Order.id}
                        className={BTN_SECONDARY}
                    >
                        Print
                    </button>

                    {/* RETURN – both PAID and UNPAID */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                                `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`,
                                { state: { selectedOrder: Order.orderId } }
                            );
                        }}
                        className={BTN_SECONDARY}
                    >
                        Return
                    </button>

                    {/* REMIND – only UNPAID Completed orders */}
                    {!isPaid && Order.status === 'Completed' && whatsappProvider === 'botmaster' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSendReminder(Order);
                            }}
                            disabled={sendingPdf}
                            className={BTN_WARN}
                        >
                            {sendingPdf ? <Spinner /> : "Remind"}
                        </button>
                    )}
                    {!isPaid && Order.status === 'Completed' && (whatsappProvider === 'snapto' || whatsappProvider === 'sellar') && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSendReminderSnapto(Order);
                            }}
                            disabled={sendingPdf}
                            className={BTN_WARN}
                        >
                            {sendingPdf ? <Spinner /> : "Remind"}
                        </button>
                    )}

                    {/* DELETE */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(Order.id);
                        }}
                        className={BTN_DANGER}
                    >
                        Delete
                    </button>

                    {/* SETTLE – only UNPAID */}
                    {!isPaid && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowPaymentModal(Order);
                            }}
                            className={BTN_PRIMARY}
                        >
                            Settle
                        </button>
                    )}
                </>
            ) : (
                <>
                    {Order.status === "Packed" && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePreviousStatus(Order.id, Order.status);
                            }}
                            className={BTN_GHOST}>
                            ← Back
                        </button>
                    )}

                    {/* DELETE */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(Order.id);
                        }}
                        className={BTN_DANGER}
                    >
                        Delete
                    </button>

                    {/* PRINT */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderForAction(Order);
                        }}
                        className={BTN_SECONDARY}
                    >
                        {pdfLoadingOrderId === Order.id ? (
                            <div className="flex items-center gap-2">
                                <Spinner />
                                <span>Printing…</span>
                            </div>
                        ) : (
                            "Print"
                        )}
                    </button>

                    {/* ADVANCE */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowPaymentModal(Order);
                        }}
                        className={BTN_SECONDARY}
                    >
                        Record advance
                    </button>

                    {/* NEXT STAGE (primary action) */}
                    {(Order.status === "Confirmed" || Order.status === "Packed") && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(Order.id, Order.status);
                            }}
                            disabled={isUpdatingStatus === Order.id}
                            className={BTN_PRIMARY}
                        >
                            {Order.status === "Confirmed" ? "Mark as packed" : "Mark as completed"} →
                        </button>
                    )}
                </>
            ))}
        </>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // MOBILE FULL-SCREEN ORDER VIEW
    // Back header → [timeline + payment] → [items] → [addresses] → pinned actions
    // Must be rendered as a direct child of the page's flex-col root.
    // ─────────────────────────────────────────────────────────────────────────
    if (variant === 'screen') {
        return (
            <>
                <header className="sticky top-0 z-[100] shrink-0 flex items-center gap-2 h-14 px-2 bg-white border-b border-[#f6e1d0]">
                    <button
                        type="button"
                        onClick={() => handleOrderClick(Order.id)}
                        aria-label="Back to orders"
                        className="w-10 h-10 rounded-full grid place-items-center text-slate-700 hover:bg-[#fff5ec] active:scale-95 transition"
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight truncate">
                            {isUpcomingStatus ? Order.userName : Order.orderId}
                        </h1>
                        <span className="block text-xs text-slate-500 truncate">
                            {isUpcomingStatus ? `Upcoming · ${Order.time}` : `${Order.userName} · ${Order.status}`}
                        </span>
                    </div>
                    {!isUpcomingStatus && (
                        <button
                            type="button"
                            onClick={() => openEditor(Order)}
                            aria-label="Edit order"
                            className="w-10 h-10 rounded-full grid place-items-center text-slate-600 hover:bg-[#fff5ec] hover:text-[#c2410c] active:scale-95 transition"
                        >
                            <IconEdit className="h-4 w-4" />
                        </button>
                    )}
                </header>

                <div className="flex-1 px-4 pt-3 pb-4 space-y-3 bg-[#fff5ec]">
                    {/* Timeline + payment summary */}
                    {!isUpcomingStatus && (
                        <div className={`${SCREEN_CARD} space-y-4`}>
                            {trackEl}
                            {totalsEl}
                        </div>
                    )}

                    {/* Items */}
                    <div className={SCREEN_CARD}>
                        {itemsEl}
                    </div>

                    {/* Billing & shipping */}
                    {!isUpcomingStatus && (
                        <div className={SCREEN_CARD}>
                            {addressesEl}
                        </div>
                    )}
                </div>

                {/* Pinned actions */}
                <div className="sticky bottom-0 z-[100] mt-auto shrink-0 flex flex-wrap gap-2 px-4 pt-3 pb-5 bg-white border-t border-[#f6e1d0]">
                    {actionButtons}
                </div>
            </>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOBILE COMPACT CARD (tap → full-screen order view)
    // ─────────────────────────────────────────────────────────────────────────
    if (variant === 'accordion') {
        const phone = Order.userLoginPhone;
        const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
        // Upcoming orders open inline inside their own card (no full-screen view)
        const isInlineOpen = isUpcomingStatus && isSelected;

        return (
            <motion.div
                key={Order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
            >
                <CustomCard
                    key={Order.id}
                    onClick={() => handleOrderClick(Order.id)}
                    className="p-0 mb-0 bg-white rounded-sm relative overflow-hidden border border-[#f6e1d0] shadow-sm hover:border-[#f9c9a8] cursor-pointer transition"
                >
                    <div className="p-3.5 grid gap-2.5">
                        <div className="flex items-center gap-2.5">
                            <span className="shrink-0 w-9 h-9 rounded-full grid place-items-center bg-[#fff8f2] text-slate-600 font-semibold text-[13px]">
                                {avatarLetter}
                            </span>

                            <div className="flex-1 min-w-0">
                                <b className="block text-sm font-semibold text-slate-900 truncate">{Order.userName}</b>
                                <div className="text-xs text-slate-500 truncate">
                                    {isUpcomingStatus
                                        ? `${phone ? `${phone} · ` : ''}${Order.time}`
                                        : `${Order.orderId} · ${Order.time} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
                                </div>
                            </div>

                            <div className="shrink-0 text-right">
                                <b className="block text-[15px] font-semibold text-slate-900 tabular-nums">₹{formatAmount(total)}</b>
                                {isUpcomingStatus ? (
                                    <div className="text-xs text-slate-500">{itemCount} {itemCount === 1 ? 'item' : 'items'}</div>
                                ) : due > 0 ? (
                                    <>
                                        <span className="inline-block text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-[#fef6d7] text-[#a16207]">UNPAID</span>
                                        <div className="text-[11px] font-medium text-[#a16207] tabular-nums">₹{formatAmount(due)} due</div>
                                    </>
                                ) : (
                                    <span className="inline-block text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{paidBadgeText}</span>
                                )}
                            </div>
                        </div>

                        {/* Return-method chips (only when the order has returns) */}
                        {returnMethods.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {returnMethods.map((method, index) => (
                                    <span
                                        key={`${method}-${index}`}
                                        className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${method === 'EXCHANGE'
                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                            : method === 'CASH REFUND'
                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                : 'bg-orange-50 text-[#F97316] border-orange-200'
                                            }`}
                                    >
                                        {method}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Upcoming: quick Call / WhatsApp on the card */}
                        {isUpcomingStatus && cleanPhone && !isInlineOpen && (
                            <div className="flex items-center gap-1.5">
                                <a
                                    href={`tel:${cleanPhone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Call"
                                    className={ICON_BTN_SECONDARY}
                                >
                                    <FiPhone className="w-4 h-4" />
                                </a>
                                <a
                                    href={`https://wa.me/${cleanPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="WhatsApp"
                                    className={ICON_BTN_SUCCESS}
                                >
                                    <FiMessageCircle className="w-4 h-4" />
                                </a>
                                <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-[#9a3412]">
                                    Open order <FiChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        )}

                        {/* Inline expanded details (Upcoming only): items + Call / WhatsApp / Print / Delete */}
                        {isInlineOpen && (
                            <div className="border-t border-[#f6e1d0] pt-3 space-y-3">
                                {itemsEl}
                                <div className="flex flex-wrap gap-2">
                                    {actionButtons}
                                </div>
                            </div>
                        )}
                    </div>
                </CustomCard>
            </motion.div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DESKTOP DETAIL PANE (variant === 'detail')
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <motion.div
            key={Order.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
        >
            <CustomCard
                key={Order.id}
                onClick={undefined}
                className="p-0 mb-0 bg-white rounded-sm relative overflow-hidden border border-[#f6e1d0] shadow-sm transition"
            >
                {/* ───────── DETAIL HEADER (desktop right pane) ───────── */}
                <div className="flex items-start gap-3 px-5 py-4 border-b border-[#f6e1d0]">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-semibold text-slate-900">
                                {isUpcomingStatus ? Order.userName : Order.orderId}
                            </h2>
                            <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 uppercase">
                                {Order.status}
                            </span>
                            {!isUpcomingStatus && (
                                due > 0 ? (
                                    <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-[#fef6d7] text-[#a16207]">UNPAID</span>
                                ) : (
                                    <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">PAID</span>
                                )
                            )}
                            {!isUpcomingStatus && (
                                <button
                                    onClick={() => openEditor(Order)}
                                    aria-label="Edit order"
                                    className="w-7 h-7 rounded-sm grid place-items-center text-slate-500 hover:bg-[#fff5ec] hover:text-[#c2410c] transition"
                                >
                                    <IconEdit className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            {Order.userName} · {itemCount} {itemCount === 1 ? 'item' : 'items'} · placed {Order.time}
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-2xl font-semibold text-slate-900 tabular-nums">₹{formatAmount(total)}</p>
                        {!isUpcomingStatus && due > 0 && (
                            <p className="text-xs font-medium text-[#a16207] tabular-nums">₹{formatAmount(due)} due</p>
                        )}
                    </div>
                </div>

                {/* ───────── DETAILS ───────── */}
                <div className="px-5 pb-4 bg-white">
                    {/* Progress track */}
                    {trackEl && <div className="pt-4">{trackEl}</div>}

                    {/* Addresses Section */}
                    {addressesEl && <div className="pt-4">{addressesEl}</div>}

                    {/* Items + Totals */}
                    <div className="mt-4">
                        {itemsEl}
                        {totalsEl && <div className="mt-3">{totalsEl}</div>}
                    </div>

                    {/* ───────── ACTION BUTTONS (same buttons, same conditions) ───────── */}
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#f6e1d0] -mx-5 -mb-4 px-5 pb-4 bg-[#fff8f2]">
                        {actionButtons}
                    </div>
                </div>
            </CustomCard>
        </motion.div>
    );
};