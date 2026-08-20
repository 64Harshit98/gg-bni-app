import React from 'react';
import { motion } from "framer-motion";
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { CustomCard } from '../../../Components/CustomCard';
import { Spinner } from '../../../constants/Spinner';
import { IconEdit } from '../../../constants/Icons';
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
    sendingPdf: boolean;
    handleDeleteOrder: (orderId: string, skipConfirm?: boolean) => void;
    setShowPaymentModal: (order: Order | null) => void;
    handlePreviousStatus: (orderId: string, currentStatus: OrderStatus) => void;
    handleUpdateStatus: (orderId: string, currentStatus: OrderStatus, manualNextStatus?: OrderStatus) => void;
    isUpdatingStatus: string | null;
}

export const OrderCard: React.FC<OrderCardProps> = ({
    order: Order,
    expandedorderId,
    handleOrderClick,
    openEditor,
    setSelectedOrderForAction,
    pdfLoadingOrderId,
    handleSendReminder,
    sendingPdf,
    handleDeleteOrder,
    setShowPaymentModal,
    handlePreviousStatus,
    handleUpdateStatus,
    isUpdatingStatus,
}) => {
    const navigate = useNavigate();

    const returnMethods =
        Order.returnHistory && Order.returnHistory.length > 0
            ? Array.from(
                new Set(
                    Order.returnHistory.map(r => r.modeOfReturn)
                )) : [];
    const isExpanded = expandedorderId === Order.id;
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
    const cardContent = (
        <motion.div
            key={Order.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
        >
            <CustomCard key={Order.id} onClick={() => handleOrderClick(Order.id)} className="p-4 mb-3 bg-white shadow-sm border border-gray-100 rounded-sm cursor-pointer relative">
                {/* 🔁 RETURN METHOD BADGE - TOP LEFT */}
                {returnMethods.length > 0 && (
                    <div className="absolute -top-0.5 left-0 flex flex-wrap gap-1 p-1">
                        {returnMethods.map((method, index) => (
                            <span
                                key={`${method}-${index}`}
                                className={`text-[7px] uppercase font-bold px-2 py-0.5 rounded border ${method === 'EXCHANGE'
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
                {!isUpcomingStatus && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            openEditor(Order);
                        }}
                        className="absolute top-5 left-2 p-2 bg-white/90 backdrop-blur-sm text-slate-500 rounded-sm transition-all duration-300 z-20 group"
                    >
                        <div className="flex items-center cursor-pointer">
                            <IconEdit className='h-3 w-3' />
                        </div>
                    </button>
                )}
                <div className="flex right-5 top-0 absolute justify-end gap-1 flex-wrap max-w-[50%] text-right pointer-events-auto">
                    {(() => {
                        const seen = new Set<string>();

                        // Collect from original payment methods
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

                        return Array.from(seen).map((method) => (
                            <span
                                key={method}
                                className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm tracking-wider bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap"
                            >
                                {method}
                            </span>
                        ));
                    })()}
                </div>

                <div className="flex justify-between items-start pl-6 mt-1">
                    <div>
                        {!isUpcomingStatus && (
                            <h3 className="text-base font-bold text-slate-800">
                                {Order.orderId}
                            </h3>
                        )}
                        <p className="text-black text-sm font-medium">
                            {Order.userName}
                            {Order.status === "Upcoming" && Order.userLoginPhone && (
                                <span className="ml-2 text-[10px] text-black font-semibold border p-1 bg-gray-100">
                                    {Order.userLoginPhone}
                                </span>
                            )}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">{Order.time}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-2">
                            <p className="text-lg font-bold text-black">₹{formatAmount(total)}
                            </p>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </div>
                        <p className="text-[10px] font-boldpx-2 py-0.5 mt-1 mr-6">Items: {Order.items?.length || 0}</p>
                    </div>
                </div>

                {isExpanded && (
                    <div className={`mt-1 border-t pt-4 ${isUpcomingStatus ? "pb-2" : ""}`}>
                        {/* Addresses Section */}
                        {!isUpcomingStatus && (
                            <div className="grid grid-cols-2 gap-4 mb-1 pb-4">
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-[#F97316] uppercase">Billing Address</p>
                                    <p className="text-[11px] font-bold text-slate-800">{Order.billingDetails?.name}</p>
                                    <p className="text-[10px] text-gray-500 leading-tight">{Order.billingDetails?.address}</p>
                                    {(Order.billingDetails?.city || Order.billingDetails?.state) && (
                                        <p className="text-[10px] text-gray-500 leading-tight">
                                            {[Order.billingDetails?.city, Order.billingDetails?.state].filter(Boolean).join(', ')}
                                        </p>
                                    )}
                                    <p className="text-[10px] text-gray-500">{Order.billingDetails?.phone}</p>
                                </div>
                                <div className="space-y-1 border-l pl-4">
                                    <p className="text-[8px] font-black text-blue-500 uppercase">Shipping Address</p>
                                    <p className="text-[11px] font-bold text-slate-800">{Order.shippingDetails?.name || Order.billingDetails?.name}</p>
                                    <p className="text-[10px] text-gray-500 leading-tight">{Order.shippingDetails?.address || Order.billingDetails?.address}</p>
                                    {(Order.shippingDetails?.city || Order.shippingDetails?.state || Order.billingDetails?.city || Order.billingDetails?.state) && (
                                        <p className="text-[10px] text-gray-500 leading-tight">
                                            {[
                                                Order.shippingDetails?.city || Order.billingDetails?.city,
                                                Order.shippingDetails?.state || Order.billingDetails?.state
                                            ].filter(Boolean).join(', ')}
                                        </p>
                                    )}
                                    <p className="text-[10px] text-gray-500">{Order.shippingDetails?.phone}</p>
                                </div>
                            </div>

                        )}
                        {/* Items Section */}
                        <div>
                            {isExpanded && Order.specialInstruction && (
                                <div className="mb-1 bg-gray-50 border border-gray-200 rounded-sm p-2">

                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">
                                        Special Instructions
                                    </p>

                                    <p className="text-[11px] text-gray-700 font-medium leading-snug break-words">
                                        {Order.specialInstruction}
                                    </p>

                                </div>
                            )}
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

                                // 👇 1. NEW LOGIC: Extract Base Price for UI Math
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
                                    <div key={idx} className="p-2 cursor-pointer">
                                        {/* REMAINING QUANTITY ROW */}
                                        {remainingQty > 0 && (
                                            <div className="flex justify-between items-start -mb-1">
                                                <div className="flex-1">
                                                    <p className="text-[11px] font-extrabold leading-tight mb-1" style={{ color: '#1e293b' }}>
                                                        {item.name}
                                                        <span className="ml-1 text-[9px] font-semibold text-gray-500">
                                                            {item.unit || "pcs"}
                                                        </span>
                                                    </p>
                                                    {item.note && (
                                                        <p className="text-[9px] leading-tight flex items-baseline gap-1.5 mt-1 opacity-80">
                                                            <span className="font-black uppercase tracking-widest font-xs">Note:</span>
                                                            <span className="font-xs italic text-slate-600">{item.note}</span>
                                                        </p>
                                                    )}
                                                    <p className="text-[10px] text-gray-400">
                                                        {/* 👇 2. Use displayUnitPrice here */}
                                                        ₹{formatAmount(displayUnitPrice)} per {item.unit || "pcs"}
                                                    </p>
                                                </div>
                                                <div className="text-right ml-4">
                                                    <p className="text-[13px] font-black text-slate-900">
                                                        {/* 👇 3. Use displayLineTotal here */}
                                                        ₹{formatAmount(displayLineTotal)}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-slate-500 bg-white">
                                                        Qty: {remainingQty}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* RETURNED ENTRIES — one crossed-out row per return event */}
                                        {returnedEntries.map((entry, rIdx) => {
                                            // 👇 4. Also fix the math for returned items crossed out on the UI
                                            let retDisplayUnitPrice = entry.unitPrice;
                                            if (taxRate > 0 && taxType === 'inclusive') {
                                                retDisplayUnitPrice = entry.unitPrice / (1 + (taxRate / 100));
                                            }
                                            const retDisplayLineTotal = retDisplayUnitPrice * entry.qty;

                                            return entry.qty > 0 && (
                                                <div key={rIdx} className="flex justify-between items-start mt-1 -mb-1">
                                                    <div className="flex-1">
                                                        <p className="text-[11px] font-extrabold leading-tight mb-1"
                                                            style={{ textDecoration: 'line-through', color: '#94a3b8' }}>
                                                            {item.name}
                                                            <span className="ml-1 text-[9px] font-semibold text-gray-400">
                                                                {item.unit || "pcs"}
                                                            </span>
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 mb-1">
                                                            {entry.modeOfReturn && (
                                                                <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${entry.modeOfReturn.toUpperCase() === 'EXCHANGE'
                                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                    : entry.modeOfReturn.toUpperCase().includes('CASH') || entry.modeOfReturn.toUpperCase().includes('REFUND')
                                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                                        : 'bg-orange-50 text-[#F97316] border-orange-200'
                                                                    }`}>
                                                                    {entry.modeOfReturn}
                                                                </span>
                                                            )}
                                                            {entry.returnedAt && (
                                                                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">
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
                                                        <p className="text-[13px] font-black" style={{ color: '#94a3b8', textDecoration: 'line-through' }}>
                                                            {/* 👇 5. Use retDisplayLineTotal here */}
                                                            ₹{formatAmount(retDisplayLineTotal)}
                                                        </p>
                                                        <p className="text-[9px] font-bold text-slate-400">
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
                                    <div key={`removed-${idx}`} className="p-2">
                                        <div className="flex justify-between items-start -mb-1">
                                            <div className="flex-1">
                                                <p className="text-[11px] font-extrabold leading-tight mb-1"
                                                    style={{ textDecoration: 'line-through', color: '#94a3b8' }}>
                                                    {r.name}
                                                    <span className="ml-1 text-[9px] font-semibold text-gray-400">
                                                        {r.unit || "pcs"}
                                                    </span>
                                                </p>
                                                {/* Return mode badge + date */}
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-1">
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
                                                                    <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${matchedHistory.modeOfReturn === 'EXCHANGE'
                                                                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                        : matchedHistory.modeOfReturn === 'CASH REFUND'
                                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                                            : 'bg-orange-50 text-[#F97316] border-orange-200'
                                                                        }`}>
                                                                        {matchedHistory.modeOfReturn}
                                                                    </span>
                                                                )}
                                                                {matchedHistory?.returnedAt && (
                                                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">
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
                                                    <p className="text-[9px] leading-tight flex items-baseline gap-1.5 mt-1 opacity-80">
                                                        <span className="font-black uppercase tracking-widest">Note:</span>
                                                        <span className="italic text-slate-400">{r.note}</span>
                                                    </p>
                                                )}

                                            </div>
                                            <div className="text-right ml-4">
                                                <p className="text-[13px] font-black" style={{ color: '#94a3b8', textDecoration: 'line-through' }}>
                                                    ₹{formatAmount((r.effectiveUnitPrice ?? r.customPrice ?? r.salesPrice ?? r.mrp ?? 0)
                                                        * r.quantity)}                                                                        </p>
                                                <p className="text-[9px] font-bold text-slate-400">Qty: {r.quantity}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            }
                            {/* Expenses & Discount display (saved on order) */}
                            {!isUpcomingStatus && (
                                <>
                                    {Array.isArray(Order.expenses) && Order.expenses.length > 0 && (
                                        <div className="px-2 pt-1 space-y-0.5">
                                            {Order.expenses.map((ex, idx) => (
                                                <div key={idx} className="flex justify-between items-center">
                                                    <span className="text-[8px] font-bold text-orange-500 uppercase tracking-wide">
                                                        {ex.name || 'Expense'}
                                                    </span>
                                                    <span className="text-[9px] font-black text-orange-600">
                                                        +₹{formatAmount(parseFloat(String(ex.amount)) || 0)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {showTaxRow && (
                                        <div className="px-2 pt-0.5 flex justify-between items-center border-t">
                                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                                                Tax
                                            </span>
                                            <span className="text-[9px] font-black text-orange-500">
                                                +₹{formatAmount(Number(Order.totalTax))}
                                            </span>
                                        </div>
                                    )}
                                    {Number(Order.manualDiscount || 0) > 0 && (
                                        <div className="px-2 pt-0.5 flex justify-between items-center border-t">
                                            <span className="text-[8px] font-bold text-red-500 uppercase tracking-wide">Bill Discount</span>
                                            <span className="text-[9px] font-black text-red-600">
                                                -₹{formatAmount(Number(Order.manualDiscount))}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}
                            {/* Totals Section */}
                            {!isUpcomingStatus && (
                                <div className="border-t mt-1 p-2 flex items-center justify-between">
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                        {paid > 0 && (
                                            (() => {
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
                                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-100"
                                                    >
                                                        <span className="text-[10px] font-bold text-green-800 uppercase">
                                                            {method}
                                                        </span>
                                                        <span className="text-[10px] font-black text-green-600">
                                                            ₹{Number(amount).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ));
                                            })()
                                        )}
                                    </div>

                                    <div className='flex gap-3 items-center'>
                                        <div className="text-right border-r border-slate-200 pr-3">
                                            <p className="text-[7px] font-bold text-green-600 uppercase tracking-tighter leading-none mb-0.5">Paid</p>
                                            <p className="text-[11px] font-black text-green-700 leading-none">₹{paid.toFixed(2)}</p>
                                        </div>

                                        <div className="text-right border-r border-slate-200 pr-3">
                                            <p className="text-[7px] font-bold text-blue-600 uppercase tracking-tighter leading-none mb-0.5">C.Note</p>
                                            <p className="text-[11px] font-black text-blue-700 leading-none">
                                                ₹{Number(Order.creditNoteAmount || 0).toFixed(2)}
                                            </p>
                                        </div>

                                        {Number(Order.refundAmount || 0) > 0 && (
                                            <div className="text-right border-r border-slate-200 pr-3">
                                                <p className="text-[7px] font-bold text-red-600  uppercase tracking-tighter leading-none mb-0.5">Refund</p>
                                                <p className="text-[11px] font-black text-red-600 leading-none">
                                                    ₹{Number(Order.refundAmount || 0).toFixed(2)}
                                                </p>
                                            </div>
                                        )}
                                        <div className="text-right">
                                            <p className="text-[7px] font-bold text-red-600 uppercase tracking-tighter leading-none mb-0.5">Due</p>
                                            <p className="text-[11px] font-black text-red-700 leading-none">₹{due.toFixed(2)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Buttons Section - Updated Grid & Logic */}
                        {(
                            <div
                                className={`grid ${isUpcomingStatus
                                    ? Order.userLoginPhone ? 'grid-cols-4' : 'grid-cols-2'
                                    : Order.status === "Packed"
                                        ? 'grid-cols-5 md:grid-cols-5'
                                        : Order.status === "Paid"
                                            ? 'grid-cols-3'
                                            : Order.status === "Completed"
                                                ? (!isPaid ? 'grid-cols-5' : 'grid-cols-4')
                                                : 'grid-cols-4'
                                    } gap-3 pt-6 border-t`}
                            >
                                {/* UPCOMING STAGE BUTTONS */}
                                {isUpcomingStatus && Order.userLoginPhone && (
                                    <>
                                        <a
                                            href={`tel:${Order.userLoginPhone.replace(/\D/g, '')}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="min-h-[44px] py-2.5 bg-blue-600 text-white text-xs font-bold rounded-sm text-center"
                                        >
                                            Call
                                        </a>

                                        <a
                                            href={`https://wa.me/${Order.userLoginPhone.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="min-h-[44px] py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm text-center"
                                        >
                                            WhatsApp
                                        </a>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedOrderForAction(Order);
                                            }}
                                            disabled={pdfLoadingOrderId === Order.id}
                                            className="min-h-[44px] py-2.5 bg-black text-white text-xs font-bold rounded-sm flex items-center justify-center"
                                        >
                                            {pdfLoadingOrderId === Order.id ? <Spinner /> : "Print"}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteOrder(Order.id);
                                            }}
                                            className="min-h-[44px] py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm cursor-pointer"
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                                {/* NEW: fallback for upcoming/lead orders that have no phone captured yet —
    still let the seller print/download the bill */}
                                {isUpcomingStatus && !Order.userLoginPhone && (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedOrderForAction(Order);
                                            }}
                                            disabled={pdfLoadingOrderId === Order.id}
                                            className="py-2.5 bg-blue-600 text-white text-xs font-bold rounded-sm flex items-center justify-center"
                                        >
                                            {pdfLoadingOrderId === Order.id ? <Spinner /> : "Print"}
                                        </button>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteOrder(Order.id);
                                            }}
                                            className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm cursor-pointer"
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                                {!isUpcomingStatus && (isFinalStage ? (
                                    <>

                                        {/* DELETE */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteOrder(Order.id);
                                            }}
                                            className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm cursor-pointer"
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
                                                className="py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm"
                                            >
                                                Settle
                                            </button>
                                        )}
                                        {/* REMIND – only UNPAID Completed orders */}
                                        {!isPaid && Order.status === 'Completed' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSendReminder(Order);
                                                }}
                                                disabled={sendingPdf}
                                                className="py-2.5 bg-amber-500 text-white text-xs font-bold rounded-sm disabled:opacity-50 flex items-center justify-center"
                                            >
                                                {sendingPdf ? <Spinner /> : "Remind"}
                                            </button>
                                        )}

                                        {/* RETURN – PAID + UNPAID dono me */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(
                                                    `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`,
                                                    { state: { selectedOrder: Order.orderId } }
                                                );
                                            }}
                                            className="py-2.5 bg-sky-500 text-white text-xs font-bold rounded-sm"
                                        >
                                            Return
                                        </button>

                                        {/* PRINT */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedOrderForAction(Order);
                                            }}
                                            disabled={pdfLoadingOrderId === Order.id}
                                            className="py-2.5 bg-black text-white text-xs font-bold rounded-sm flex items-center justify-center"
                                        >
                                            Print
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {Order.status === "Packed" && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePreviousStatus(Order.id, Order.status);
                                                }}
                                                className="w-full py-2.5 bg-gray-200 text-black text-sm font-bold rounded-sm flex items-center justify-center flex-col">
                                                ←
                                                <span className='text-[10px]'>back</span>
                                            </button>
                                        )}
                                        {/* DELETE */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteOrder(Order.id);
                                            }}
                                            className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm"
                                        >
                                            Delete
                                        </button>

                                        {/* ADVANCE */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowPaymentModal(Order);
                                            }}
                                            className="py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm"
                                        >
                                            Advance
                                        </button>

                                        {/* PRINT */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedOrderForAction(Order);
                                            }}
                                            className="py-2.5 bg-black text-white text-xs font-bold rounded-sm"
                                        >
                                            {pdfLoadingOrderId === Order.id ? (
                                                <div className="flex items-center gap-2">
                                                    <Spinner />
                                                    <span>...Printing</span>
                                                </div>
                                            ) : (
                                                "Print"
                                            )}
                                        </button>

                                        {/* PREVIOUS ARROW (only Packed stage) */}
                                        {(Order.status === "Confirmed" || Order.status === "Packed") && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleUpdateStatus(Order.id, Order.status);
                                                }}
                                                disabled={isUpdatingStatus === Order.id}
                                                className="py-2.5 bg-[#00A2FF] text-white text-xs font-bold rounded-sm flex items-center justify-center flex-col"
                                            >
                                                →
                                                <span className='text-[10px]'>Next</span>
                                            </button>
                                        )}
                                    </>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CustomCard>
        </motion.div>
    );

    return cardContent;
};
