import React, { useState } from 'react';
import { motion } from "framer-motion";
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiArrowLeftCircle, FiEdit, FiMessageCircle, FiPhone, FiPrinter, FiTrash2 } from 'react-icons/fi';
import { ROUTES } from '../../../constants/routes.constants';
import { CustomCard } from '../../../Components/CustomCard';
import { Spinner } from '../../../constants/Spinner';
import { ItemsHeader, PinnedDetail } from '../../../Components/PinnedDetail';
import { useWhatsappProvider } from '../../../Pages/Additional/Whatsapp/useWhatsappProvider';
import type { Order, OrderStatus } from '../orders.types';
import { formatDayTime } from '../../../lib/format';
import { splitAddOns } from '../../../UseComponents/addOnText';

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
const BTN = 'min-h-[40px] px-3 rounded-sm text-sm font-medium whitespace-nowrap transition active:scale-[0.97] flex items-center justify-center gap-1.5 flex-1 sm:flex-none disabled:opacity-50';
const BTN_PRIMARY = `${BTN} bg-[#c2410c] hover:bg-[#9a3412] text-white`;
const STAGES = ['Placed', 'Confirmed', 'Packed', 'Completed'] as const;
const BTN_SECONDARY = `${BTN} bg-white border border-[#f6e1d0] text-slate-800 hover:bg-[#fff8f2]`;
const BTN_DANGER = `${BTN} bg-white border border-red-200 text-red-600 hover:bg-red-50`;
const BTN_SUCCESS = `${BTN} bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100`;
const BTN_WARN = `${BTN} bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100`;
const BTN_SMALL = 'h-8 px-2.5 rounded-sm text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 bg-white border border-[#f6e1d0] text-slate-800 hover:bg-[#fff8f2] transition';
const OVERLINE = 'text-[10px] font-semibold uppercase tracking-wider text-[#9a3412]';
const BADGE = 'text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-sm whitespace-nowrap';
const BADGE_STATUS = `${BADGE} bg-[#ffedd5] text-[#9a3412] uppercase`;
const BADGE_UNPAID = `${BADGE} bg-[#fef6d7] text-[#a16207]`;
const BADGE_PAID = `${BADGE} bg-emerald-50 text-emerald-700`;
// compact mobile card icon buttons (Call / WhatsApp)
const ICON_BTN = 'w-10 h-10 shrink-0 rounded-sm grid place-items-center transition active:scale-[0.97]';
const ICON_BTN_SECONDARY = `${ICON_BTN} bg-white border border-[#f6e1d0] text-slate-800 hover:bg-[#fff8f2]`;
const ICON_BTN_SUCCESS = `${ICON_BTN} bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100`;
// white surface card used on the mobile full-screen view
const SCREEN_CARD = 'bg-white border border-[#f6e1d0] rounded-sm shadow-sm p-4';
const ITEM_GRID = 'grid grid-cols-[minmax(0,1fr)_36px_92px] gap-x-3';

// Summary figures: "₹6,471", at most 2 decimals. Line prices: always 2 ("₹533.90")
const money = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const money2 = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const returnBadgeClass = (mode: string) => {
    const m = (mode || '').toUpperCase();
    if (m === 'EXCHANGE') return 'bg-purple-50 text-purple-700 border-purple-200';
    if (m.includes('CASH') || m.includes('REFUND')) return 'bg-green-50 text-green-700 border-green-200';
    return 'bg-orange-50 text-[#c2410c] border-orange-200';
};

const fmtReturnedAt = (v: any) =>
    new Date(v?.toDate ? v.toDate() : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

const sameText = (a?: string, b?: string) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

type ActionIconKey = 'edit' | 'back' | 'delete';

interface MoreMenuItem {
    key: ActionIconKey;
    label: string;
    onSelect: () => void;
    danger?: boolean;
}

const ACTION_ICONS: Record<ActionIconKey, React.ComponentType<{ className?: string }>> = {
    edit: FiEdit,
    back: FiArrowLeftCircle,
    delete: FiTrash2,
};

// Edit / move back / delete: ab seedha icon buttons (no dropdown)
const ActionIcons: React.FC<{ items: MoreMenuItem[] }> = ({ items }) => (
    <div className="flex items-center gap-0.5 shrink-0">
        {items.map((item) => {
            const Icon = ACTION_ICONS[item.key];
            return (
                <button
                    key={item.key}
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    onClick={(e) => { e.stopPropagation(); item.onSelect(); }}
                    className={`w-10 h-10 rounded-sm grid place-items-center transition active:scale-95 ${item.danger
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-slate-600 hover:bg-[#fff5ec] hover:text-[#c2410c]'}`}
                >
                    <Icon className="w-5 h-5" />
                </button>
            );
        })}
    </div>
);

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
    const [itemQuery, setItemQuery] = useState('');

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
    const pieces = (Order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const stageIndex = isFinalStage ? 3 : Order.status === 'Packed' ? 2 : Order.status === 'Confirmed' ? 1 : 0;
    const placedAt = Order.createdAt ? formatDayTime(new Date(Order.createdAt)) : Order.time;
    const contactPhone = Order.userLoginPhone || Order.billingDetails?.phone || '';
    const cleanContactPhone = contactPhone.replace(/\D/g, '');
    const inDetailPane = variant === 'detail';
    // A settled order sits in the Completed stage; the PAID badge says the rest
    const stageLabel = Order.status === 'Paid' ? 'Completed' : Order.status;

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
                <span className="text-sm font-semibold text-slate-900 tabular-nums text-right">₹{money(total)}</span>
                <span className="text-xs text-slate-500 truncate">
                    {!isUpcomingStatus && `${Order.orderId} · `}{placedAt} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
                {isUpcomingStatus ? (
                    <span className={`${BADGE} bg-[#f97316] text-white justify-self-end`}>NEW</span>
                ) : due > 0 ? (
                    <span className={`${BADGE_UNPAID} justify-self-end`}>UNPAID</span>
                ) : (
                    <span className={`${BADGE_PAID} justify-self-end`}>PAID</span>
                )}
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHARED PIECES (used by 'detail' on desktop and 'screen' on mobile)
    // ─────────────────────────────────────────────────────────────────────────

    // Progress track: Placed → Confirmed → Packed → Completed
    const trackEl = !isUpcomingStatus && (
        <div className="grid grid-cols-4">
            {STAGES.map((s, i) => {
                const on = i <= stageIndex;
                return (
                    <div key={s} className="relative pt-[18px] text-[10px] sm:text-xs text-slate-500">
                        {i < STAGES.length - 1 && (
                            <span className={`absolute top-1 left-0 right-0 h-[3px] ${i < stageIndex ? 'bg-[#c2410c]' : 'bg-[#f6e1d0]'}`} />
                        )}
                        <span className={`absolute top-0 left-0 w-[11px] h-[11px] rounded-full border-2 ${on ? 'bg-[#c2410c] border-[#c2410c]' : 'bg-white border-[#f6e1d0]'} ${i === stageIndex ? 'ring-4 ring-[#ffedd5]' : ''}`} />
                        <b className="block text-xs sm:text-[13px] font-semibold text-slate-900">{s}</b>
                        {i === 0 ? placedAt : i === stageIndex + 1 ? 'Next' : on ? '' : '—'}
                    </div>
                );
            })}
        </div>
    );

    // Billing + Shipping: merged into one when they're the same address
    const billing = Order.billingDetails;
    const shipping = Order.shippingDetails;
    const hasSameAddress = !shipping?.address || (
        (!shipping.name || sameText(shipping.name, billing?.name)) &&
        sameText(shipping.address, billing?.address) &&
        (!shipping.city || sameText(shipping.city, billing?.city)) &&
        (!shipping.state || sameText(shipping.state, billing?.state)) &&
        (!shipping.phone || sameText(shipping.phone, billing?.phone))
    );
    const billingPlace = [billing?.address, billing?.city, billing?.state].filter(Boolean).join(', ');

    const addressesEl = !isUpcomingStatus && (
        hasSameAddress ? (
            <div className="p-3 border border-[#f6e1d0] rounded-sm lg:flex lg:flex-wrap lg:items-center lg:gap-x-2.5">
                <p className={OVERLINE}>Billing & shipping</p>
                <p className="text-[13px] leading-snug text-slate-600 break-words">
                    <b className="font-semibold text-slate-900">{billing?.name}</b>
                    {[billingPlace, billing?.phone].filter(Boolean).map((part) => ` · ${part}`).join('')}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 lg:mt-0 lg:ml-auto">Same address for both</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 border border-[#f6e1d0] rounded-sm space-y-0.5">
                    <p className={OVERLINE}>Billing address</p>
                    <p className="text-[13px] font-semibold text-slate-900">{billing?.name}</p>
                    <p className="text-xs text-slate-600 leading-snug">{billing?.address}</p>
                    {(billing?.city || billing?.state) && (
                        <p className="text-xs text-slate-600 leading-snug">
                            {[billing?.city, billing?.state].filter(Boolean).join(', ')}
                        </p>
                    )}
                    <p className="text-xs text-slate-600">{billing?.phone}</p>
                </div>
                <div className="p-3 border border-[#f6e1d0] rounded-sm space-y-0.5">
                    <p className={OVERLINE}>Shipping address</p>
                    <p className="text-[13px] font-semibold text-slate-900">{shipping?.name || billing?.name}</p>
                    <p className="text-xs text-slate-600 leading-snug">{shipping?.address || billing?.address}</p>
                    {(shipping?.city || shipping?.state || billing?.city || billing?.state) && (
                        <p className="text-xs text-slate-600 leading-snug">
                            {[
                                shipping?.city || billing?.city,
                                shipping?.state || billing?.state
                            ].filter(Boolean).join(', ')}
                        </p>
                    )}
                    <p className="text-xs text-slate-600">{shipping?.phone}</p>
                </div>
            </div>
        )
    );

    const callWhatsappEl = cleanContactPhone && (
        <div className="flex shrink-0 gap-1.5">
            <a href={`tel:${cleanContactPhone}`} onClick={(e) => e.stopPropagation()} className={BTN_SMALL}>
                <FiPhone className="w-3.5 h-3.5" /> Call
            </a>
            <a href={`https://wa.me/${cleanContactPhone}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={BTN_SMALL}>
                <FiMessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
        </div>
    );

    // Price shown on an item line. If tax is inclusive, reverse-calculate the base
    // price so the UI math adds up with the "+Tax" row. Tax rate/type as saved on the
    // item at checkout/edit time — not gated by the company's current tax toggle.
    const displayPrice = (item: any, unitPrice: number) => {
        const taxRate = Number(item.tax ?? item.taxRate ?? 0);
        const taxType = (item.taxType || '').toLowerCase();
        return taxRate > 0 && taxType === 'inclusive' ? unitPrice / (1 + (taxRate / 100)) : unitPrice;
    };
    const rawUnitPrice = (item: any) => Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
    const itemsSubtotal = (Order.items || []).reduce(
        (sum, item) => sum + displayPrice(item, rawUnitPrice(item)) * (Number(item.quantity) || 0),
        0
    );

    const query = itemQuery.trim().toLowerCase();
    const matchesQuery = (name?: string) => !query || (name || '').toLowerCase().includes(query);
    const visibleItems = (Order.items || [])
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => matchesQuery(item.name));
    const removedItems = (Order.returnHistory || []).flatMap((h: any) => h.returnedItems || [])
        .filter((r: any) => !Order.items?.some(item =>
            String(item.itemId) === String(r.originalItemId) ||
            String(item.id) === String(r.originalItemId)
        ))
        .filter((r: any) => matchesQuery(r.name));

    // Mode badge + date under a returned line
    const returnMetaEl = (modeOfReturn?: string, returnedAt?: any) => (
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {modeOfReturn && (
                <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-sm border ${returnBadgeClass(modeOfReturn)}`}>
                    {modeOfReturn}
                </span>
            )}
            {returnedAt && (
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                    {fmtReturnedAt(returnedAt)}
                </span>
            )}
        </div>
    );

    const rowPad = inDetailPane ? 'px-5' : '';
    // Rows are numbered in the desktop pane; returned rows line up under the item names
    const returnedIndent = inDetailPane ? 'pl-[22px]' : '';

    // Special instructions + Items list + Expenses / Tax / Bill discount
    const itemsEl = (
        <div>
            {Order.specialInstruction && (
                <div className={`mb-3 bg-[#fef6d7] border border-[#f3e3a0] rounded-sm p-3 ${inDetailPane ? 'mx-5' : ''}`}>
                    <p className="text-[10px] font-semibold text-[#a16207] uppercase tracking-wider mb-1">
                        Special instructions
                    </p>
                    <p className="text-xs text-slate-800 font-medium leading-snug break-words">
                        {Order.specialInstruction}
                    </p>
                </div>
            )}

            <div>
                <ItemsHeader
                    theme="orange"
                    lineCount={itemCount}
                    pieces={pieces}
                    query={itemQuery}
                    onQueryChange={setItemQuery}
                    gridClassName={ITEM_GRID}
                    sticky={inDetailPane}
                    className={inDetailPane ? 'border-t px-5' : ''}
                >
                    <span className="text-right">Qty</span>
                    <span className="text-right">Amount</span>
                </ItemsHeader>

                <div className="divide-y divide-[#f6e1d0] border-b border-[#f6e1d0]">
                    {visibleItems.map(({ item, index }) => {
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

                        const displayUnitPrice = displayPrice(item, rawUnitPrice(item));
                        const { baseName, addOnList } = splitAddOns(item);
                        const showBase = addOnList.length > 0 && addOnList.every(a => a.price !== undefined);
                        const basePrice = displayUnitPrice - addOnList.reduce((s, a) => s + (Number(a.price) || 0), 0);

                        return (
                            <div key={index} className={`${rowPad} py-2.5`}>
                                {/* REMAINING QUANTITY ROW */}
                                {remainingQty > 0 && (
                                    <div className={ITEM_GRID}>
                                        <div className="flex min-w-0">
                                            {inDetailPane && (
                                                <span className="w-[22px] shrink-0 text-xs leading-[18px] tabular-nums text-slate-500">{index + 1}</span>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-medium leading-tight text-slate-900 break-words">
                                                    {baseName}
                                                    {showBase && <span className="font-normal text-slate-500 tabular-nums"> · ₹{money2(basePrice)}</span>}
                                                </p>
                                                {addOnList.map((a, aIdx) => (
                                                    <p key={aIdx} className="text-[11px] leading-tight text-slate-500 mt-0.5 break-words">
                                                        + {a.name}
                                                        {a.price !== undefined && (
                                                            <span className="tabular-nums"> · {Number(a.price) > 0 ? `₹${money2(Number(a.price))}` : 'Free'}</span>
                                                        )}
                                                    </p>
                                                ))}
                                                {item.note && (
                                                    <p className="text-[11px] leading-tight flex items-baseline gap-1.5 mt-1">
                                                        <span className="font-semibold uppercase tracking-wider text-slate-500">Note:</span>
                                                        <span className="italic text-slate-600">{item.note}</span>
                                                    </p>
                                                )}
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    ₹{money2(displayUnitPrice)} per {item.unit || "pcs"}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-right text-[13px] tabular-nums text-slate-900">{remainingQty}</p>
                                        <p className="text-right text-[13px] font-semibold tabular-nums text-slate-900">₹{money2(displayUnitPrice * remainingQty)}</p>
                                    </div>
                                )}

                                {/* RETURNED ENTRIES — one crossed-out row per return event */}
                                {returnedEntries.map((entry, rIdx) => (
                                    entry.qty > 0 && (
                                        <div key={rIdx} className={`${ITEM_GRID} mt-1.5`}>
                                            <div className={`min-w-0 ${returnedIndent}`}>
                                                <p className="text-[13px] font-medium leading-tight line-through text-slate-400 break-words">{baseName}</p>
                                                {addOnList.map((a, aIdx) => (
                                                    <p key={aIdx} className="text-[11px] leading-tight line-through text-slate-400 mt-0.5 break-words">
                                                        + {a.name}
                                                        {a.price !== undefined && (
                                                            <span className="tabular-nums"> · {Number(a.price) > 0 ? `₹${money2(Number(a.price))}` : 'Free'}</span>
                                                        )}
                                                    </p>
                                                ))}
                                                {returnMetaEl(entry.modeOfReturn, entry.returnedAt)}
                                            </div>
                                            <p className="text-right text-[13px] line-through tabular-nums text-slate-400">{entry.qty}</p>
                                            <p className="text-right text-[13px] font-semibold line-through tabular-nums text-slate-400">
                                                ₹{money2(displayPrice(item, entry.unitPrice) * entry.qty)}
                                            </p>
                                        </div>
                                    )
                                ))}
                            </div>
                        );
                    })}

                    {/* Show fully removed returned items */}
                    {removedItems.map((r: any, idx: number) => {
                        const matchedHistory = Order.returnHistory?.find((h: any) =>
                            h.returnedItems?.some((ri: any) =>
                                String(ri.originalItemId) === String(r.originalItemId) ||
                                String(ri.id) === String(r.originalItemId)
                            )
                        );
                        return (
                            <div key={`removed-${idx}`} className={`${rowPad} py-2.5`}>
                                <div className={ITEM_GRID}>
                                    <div className={`min-w-0 ${returnedIndent}`}>
                                        <p className="text-[13px] font-medium leading-tight line-through text-slate-400 break-words">{r.name}</p>
                                        {returnMetaEl(matchedHistory?.modeOfReturn, matchedHistory?.returnedAt)}
                                        {r.note && (
                                            <p className="text-[11px] leading-tight flex items-baseline gap-1.5 mt-1">
                                                <span className="font-semibold uppercase tracking-wider text-slate-400">Note:</span>
                                                <span className="italic text-slate-400">{r.note}</span>
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-right text-[13px] line-through tabular-nums text-slate-400">{r.quantity}</p>
                                    <p className="text-right text-[13px] font-semibold line-through tabular-nums text-slate-400">
                                        ₹{money2((r.effectiveUnitPrice ?? r.customPrice ?? r.salesPrice ?? r.mrp ?? 0) * r.quantity)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}

                    {query && visibleItems.length === 0 && removedItems.length === 0 && (
                        <p className={`${rowPad} py-3 text-xs text-slate-500`}>No item on this order matches "{itemQuery.trim()}".</p>
                    )}
                </div>
            </div>

            {/* Items total, expenses, tax & discount (saved on order), order total */}
            {!isUpcomingStatus && (
                <div className={`${rowPad} pt-2 space-y-1`}>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Items ({itemCount})</span>
                        <span className="font-semibold text-slate-800 tabular-nums">₹{money2(itemsSubtotal)}</span>
                    </div>
                    {Array.isArray(Order.expenses) && Order.expenses.length > 0 && (
                        <>
                            {Order.expenses.map((ex, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">{ex.name || 'Expense'}</span>
                                    <span className="font-semibold text-slate-800 tabular-nums">
                                        +₹{money2(parseFloat(String(ex.amount)) || 0)}
                                    </span>
                                </div>
                            ))}
                        </>
                    )}
                    {showTaxRow && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Tax</span>
                            <span className="font-semibold text-slate-800 tabular-nums">
                                +₹{money2(Number(Order.totalTax))}
                            </span>
                        </div>
                    )}
                    {Number(Order.manualDiscount || 0) > 0 && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Bill discount</span>
                            <span className="font-semibold text-red-600 tabular-nums">
                                -₹{money2(Number(Order.manualDiscount))}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between items-center border-t border-[#f6e1d0] pt-2 mt-1 text-[15px] font-semibold text-slate-900">
                        <span>Order total</span>
                        <span className="tabular-nums">₹{money2(total)}</span>
                    </div>
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
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-emerald-50 border border-emerald-100"
                            >
                                <span className="text-[11px] font-semibold text-emerald-800 uppercase">
                                    {method}
                                </span>
                                <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                                    ₹{money2(Number(amount))}
                                </span>
                            </div>
                        ));
                    })()}
                </div>
            )}

            <div className={`grid ${hasRefund ? 'grid-cols-4' : 'grid-cols-3'} border border-[#f6e1d0] rounded-sm overflow-hidden`}>
                <div className="px-3 py-2 border-r border-[#f6e1d0]">
                    <p className="text-[11px] text-slate-500">Paid</p>
                    <p className="text-sm font-semibold text-emerald-700 tabular-nums">₹{money2(paid)}</p>
                </div>
                <div className="px-3 py-2 border-r border-[#f6e1d0]">
                    <p className="text-[11px] text-slate-500">Credit note</p>
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">
                        ₹{money2(Number(Order.creditNoteAmount || 0))}
                    </p>
                </div>
                {hasRefund && (
                    <div className="px-3 py-2 border-r border-[#f6e1d0]">
                        <p className="text-[11px] text-slate-500">Refund</p>
                        <p className="text-sm font-semibold text-red-600 tabular-nums">
                            ₹{money2(Number(Order.refundAmount || 0))}
                        </p>
                    </div>
                )}
                <div className={`px-3 py-2 ${due > 0 ? 'bg-[#fef6d7]' : ''}`}>
                    <p className="text-[11px] text-slate-500">Due</p>
                    <p className={`text-sm font-semibold tabular-nums ${due > 0 ? 'text-[#a16207]' : 'text-slate-800'}`}>₹{money2(due)}</p>
                </div>
            </div>
        </div>
    );

    // Rarely-needed actions behind ⋯ (same conditions as before)
    const moreItems: MoreMenuItem[] = [
        ...(!isUpcomingStatus ? [{ key: 'edit' as const, label: 'Edit order', onSelect: () => openEditor(Order) }] : []),
        ...(Order.status === 'Packed' ? [{ key: 'back' as const, label: 'Move back to Confirmed', onSelect: () => handlePreviousStatus(Order.id, Order.status) }] : []),
        { key: 'delete' as const, label: 'Delete order', danger: true, onSelect: () => handleDeleteOrder(Order.id) },
    ];

    const confirmButton = (
        <button
            onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(Order.id, Order.status);
            }}
            disabled={isUpdatingStatus === Order.id}
            className={BTN_PRIMARY}
        >
            {isUpdatingStatus === Order.id ? <Spinner /> : 'Confirm order'}
        </button>
    );

    // Upcoming order opened inline on its mobile card
    const inlineUpcomingActions = (
        <>
            {cleanContactPhone && (
                <>
                    <a href={`tel:${cleanContactPhone}`} onClick={(e) => e.stopPropagation()} className={BTN_SECONDARY}>
                        Call
                    </a>
                    <a
                        href={`https://wa.me/${cleanContactPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={BTN_SUCCESS}
                    >
                        WhatsApp
                    </a>
                </>
            )}
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
            {confirmButton}
        </>
    );

    // Pinned actions. compact = mobile bar: icon-only Print, shorter labels.
    const pinnedActions = (compact: boolean) => (
        <>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOrderForAction(Order);
                }}
                disabled={pdfLoadingOrderId === Order.id}
                aria-label="Print"
                className={compact ? ICON_BTN_SECONDARY : BTN_SECONDARY}
            >
                {pdfLoadingOrderId === Order.id ? <Spinner /> : compact ? <FiPrinter className="w-4 h-4" /> : 'Print'}
            </button>

            {isUpcomingStatus && confirmButton}

            {!isUpcomingStatus && isFinalStage && (
                <>
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
            )}

            {!isUpcomingStatus && !isFinalStage && (
                <>
                    {/* ADVANCE */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowPaymentModal(Order);
                        }}
                        className={BTN_SECONDARY}
                    >
                        {compact ? 'Advance' : 'Record advance'}
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
                            {Order.status === "Confirmed" ? "Mark as packed" : "Mark as completed"}
                        </button>
                    )}
                </>
            )}
        </>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // MOBILE FULL-SCREEN ORDER VIEW
    // Back header → [timeline + payment] → [items] → [addresses + contact] → pinned actions
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
                        className="w-10 h-10 rounded-sm grid place-items-center text-slate-700 hover:bg-[#fff5ec] active:scale-95 transition"
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight truncate">
                            {isUpcomingStatus ? Order.userName : Order.orderId}
                        </h1>
                        <span className="block text-xs text-slate-500 truncate">
                            {isUpcomingStatus ? `Upcoming · ${placedAt}` : `${Order.userName} · ${stageLabel}`}
                        </span>
                    </div>
                    <ActionIcons items={moreItems} />
                </header>

                <div className="grow shrink-0 px-4 pt-3 pb-4 space-y-3 bg-[#fff5ec]">
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

                    {/* Customer: billing & shipping + contact */}
                    {!isUpcomingStatus && (
                        <div className={`${SCREEN_CARD} space-y-3`}>
                            {addressesEl}
                            {callWhatsappEl}
                        </div>
                    )}
                </div>

                {/* Pinned actions */}
                <div className="sticky bottom-0 z-[100] mt-auto shrink-0 flex flex-wrap gap-2 px-4 pt-3 pb-5 bg-white border-t border-[#f6e1d0]">
                    {pinnedActions(true)}
                </div>
            </>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOBILE COMPACT CARD (tap → full-screen order view)
    // ─────────────────────────────────────────────────────────────────────────
    if (variant === 'accordion') {
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
                    <div className="p-3 grid gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <span className="shrink-0 w-9 h-9 rounded-full grid place-items-center bg-[#fff8f2] text-slate-600 font-semibold text-[13px]">
                                {avatarLetter}
                            </span>

                            <div className="flex-1 min-w-0">
                                <b className="block text-sm font-semibold text-slate-900 truncate">{Order.userName}</b>
                                <div className="text-xs text-slate-500 truncate">
                                    {isUpcomingStatus
                                        ? `${contactPhone ? `${contactPhone} · ` : ''}${placedAt}`
                                        : `${Order.orderId} · ${placedAt} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
                                </div>
                            </div>

                            <div className="shrink-0 max-w-[55%] flex flex-col items-end gap-0.5">
    <div className="flex items-center gap-1">
        {!isUpcomingStatus && due > 0 && (
            <span className={`${BADGE_UNPAID} !px-1.5 !text-[9px]`}>UNPAID</span>
        )}
        <b className="text-[15px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">₹{money(total)}</b>
    </div>
    {isUpcomingStatus ? (
        <div className="text-xs text-slate-500">{itemCount} {itemCount === 1 ? 'item' : 'items'}</div>
    ) : due > 0 ? (
        <div className="text-[11px] font-medium text-[#a16207] tabular-nums whitespace-nowrap">₹{money(due)} due</div>
    ) : (
        <span className={BADGE_PAID}>{paidBadgeText}</span>
    )}
</div>
                        </div>

                        {/* Return-method chips (only when the order has returns) */}
                        {returnMethods.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {returnMethods.map((method, index) => (
                                    <span
                                        key={`${method}-${index}`}
                                        className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm border ${returnBadgeClass(method)}`}
                                    >
                                        {method}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Upcoming: Call / WhatsApp / Confirm right on the card */}
                        {isUpcomingStatus && !isInlineOpen && (
                            <div className="flex items-center gap-1.5">
                                {cleanContactPhone && (
                                    <>
                                        <a
                                            href={`tel:${cleanContactPhone}`}
                                            onClick={(e) => e.stopPropagation()}
                                            aria-label="Call"
                                            className={ICON_BTN_SECONDARY}
                                        >
                                            <FiPhone className="w-4 h-4" />
                                        </a>
                                        <a
                                            href={`https://wa.me/${cleanContactPhone}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            aria-label="WhatsApp"
                                            className={ICON_BTN_SUCCESS}
                                        >
                                            <FiMessageCircle className="w-4 h-4" />
                                        </a>
                                    </>
                                )}
                                {confirmButton}
                            </div>
                        )}

                        {/* Inline expanded details (Upcoming only): items + Call / WhatsApp / Print / Delete / Confirm */}
                        {isInlineOpen && (
                            <div className="border-t border-[#f6e1d0] pt-3 space-y-3">
                                {itemsEl}
                                <div className="flex flex-wrap gap-2">
                                    {inlineUpcomingActions}
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
    // Pinned top (who + contact) → scrolling middle → pinned bottom (total + actions)
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <motion.div
            key={Order.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="h-full min-h-0"
        >
            <PinnedDetail
                theme="orange"
                moreHint="Scroll for more items and payment"
                className="h-full bg-white rounded-sm border border-[#f6e1d0] shadow-sm"
                header={
                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-4">
                        <div className="flex-1 min-w-[180px]">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl font-semibold text-slate-900">
                                    {isUpcomingStatus ? Order.userName : Order.orderId}
                                </h2>
                                <span className={BADGE_STATUS}>{stageLabel}</span>
                                {!isUpcomingStatus && (
                                    due > 0
                                        ? <span className={BADGE_UNPAID}>UNPAID</span>
                                        : <span className={BADGE_PAID}>PAID</span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                {!isUpcomingStatus && `${Order.userName} · `}{contactPhone && `${contactPhone} · `}placed {placedAt}
                            </p>
                        </div>
                        {callWhatsappEl}
                    </div>
                }
                footer={
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
                        <div className="mr-auto grid min-w-[120px] leading-tight whitespace-nowrap">
                            <span className="text-xs text-slate-600">Order total · {itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                            <b className="text-[22px] leading-7 font-semibold text-slate-900 tabular-nums">₹{money(total)}</b>
                            {!isUpcomingStatus && due > 0 && (
                                <span className="text-xs font-medium text-[#a16207] tabular-nums">₹{money(due)} due</span>
                            )}
                        </div>
                        <ActionIcons items={moreItems} />
                        {pinnedActions(false)}
                    </div>
                }
            >
                {/* Progress track */}
                {trackEl && <div className="px-5 pt-4">{trackEl}</div>}

                {/* Addresses Section */}
                {addressesEl && <div className="px-5 py-3.5">{addressesEl}</div>}

                {/* Items + Totals */}
                {itemsEl}
                {totalsEl && <div className="px-5 pb-5 pt-3">{totalsEl}</div>}
            </PinnedDetail>
        </motion.div>
    );
};
