// Loyalty points for online (catalogue) orders.
//
// Storefront customers are anonymous and can't touch the members-only loyalty
// docs, so everything here runs on the admin side:
//   - an order EARNS when staff move it to Completed / Paid (and loses it when moved back),
//   - points are REDEEMED from the order payment modal,
//   - returns and deletes undo them (see useReturnTransaction / useOrderDeletion).

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import {
    LOYALTY_ORDER_PAYMENT_KEY,
    calcEarnPoints,
    normalizeLoyaltyPhone,
    pointsToRupees,
    readLoyaltyInTxn,
    readSaleLoyalty,
    writeLoyaltyInTxn,
    type LoyaltyActor,
    type LoyaltyChange,
    type LoyaltySettings,
    type SaleLoyalty,
} from '../../lib/loyalty';
import type { OrderStatus } from './orders.types';

export const orderLoyaltyPhone = (order: { userLoginPhone?: string; billingDetails?: { phone?: string } } | null | undefined) =>
    normalizeLoyaltyPhone(order?.userLoginPhone || order?.billingDetails?.phone);

export const orderLoyaltyOn = (settings: LoyaltySettings | null | undefined) =>
    !!settings?.enabled && !!settings.applyToOnlineOrders;

const isDone = (s: string | undefined) => s === 'Completed' || s === 'Paid';

/** The fields of an Orders doc this module reads. */
interface OrderDoc {
    status?: string;
    totalAmount?: number;
    orderId?: string;
    userName?: string;
    userLoginPhone?: string;
    billingDetails?: { phone?: string; name?: string };
    loyalty?: unknown;
}

/**
 * Most points that can pay an order right now: limited by the balance, the
 * minimum, the max-% cap on the whole order (minus points already used on it)
 * and what's still due.
 */
export const maxOrderRedeemPoints = (
    balance: number,
    order: { totalAmount?: number; loyalty?: unknown },
    due: number,
    settings: LoyaltySettings | null | undefined,
): number => {
    if (!orderLoyaltyOn(settings) || !settings!.redeemEnabled) return 0;
    const value = Number(settings!.pointValue) || 0;
    if (value <= 0 || balance <= 0 || balance < (Number(settings!.minPointsToRedeem) || 0)) return 0;
    const total = Number(order.totalAmount) || 0;
    const pct = Math.min(100, Math.max(0, Number(settings!.maxRedeemPercent) || 0));
    const alreadyUsed = readSaleLoyalty(order)?.redeemed ?? 0;
    const pctCap = Math.floor((total * pct) / 100 / value + 1e-9) - alreadyUsed;
    const dueCap = Math.floor(due / value + 1e-9);
    return Math.max(0, Math.min(Math.floor(balance), pctCap, dueCap));
};

/**
 * Moves an order to `nextStatus` and, when it crosses into / out of
 * Completed–Paid, earns / takes back its points in the same transaction.
 */
export const setOrderStatusWithLoyalty = async (
    companyId: string,
    orderId: string,
    nextStatus: OrderStatus,
    settings: LoyaltySettings | null | undefined,
    actor: LoyaltyActor,
    extraFields: Record<string, unknown> = {},
): Promise<void> => {
    const orderRef = doc(db, 'companies', companyId, 'Orders', orderId);
    await runTransaction(db, async (txn) => {
        const snap = await txn.get(orderRef);
        if (!snap.exists()) return;
        const order = snap.data() as OrderDoc;
        const prev = readSaleLoyalty(order);
        const phone = prev?.phone || orderLoyaltyPhone(order);
        const crossingIn = !isDone(order.status) && isDone(nextStatus);
        const crossingOut = isDone(order.status) && !isDone(nextStatus);

        let changes: LoyaltyChange[] = [];
        let nextLoyalty: SaleLoyalty | null = prev;
        const base = { refType: 'order' as const, refId: orderId, invoiceNumber: order.orderId || '' };

        if (crossingIn && phone && orderLoyaltyOn(settings) && !(prev && prev.earned > 0)) {
            const redeemValue = prev?.redeemValue ?? 0;
            const earned = calcEarnPoints(Math.max(0, (Number(order.totalAmount) || 0) - redeemValue), settings);
            if (earned > 0) {
                changes = [{ ...base, type: 'earn', points: earned, note: 'Online order completed' }];
                nextLoyalty = { phone, earned, redeemed: prev?.redeemed ?? 0, redeemValue };
            }
        } else if (crossingOut && prev && prev.earned > 0) {
            // Reversals still apply even if loyalty has since been switched off.
            changes = [{ ...base, type: 'reverse', points: -prev.earned, note: `Order moved back to ${nextStatus}`, extra: { reverses: 'earn' } }];
            nextLoyalty = { ...prev, earned: 0 };
        }

        const account = changes.length ? await readLoyaltyInTxn(txn, db, companyId, phone) : null;
        if (account) {
            writeLoyaltyInTxn(txn, db, companyId, account, changes, {
                name: order.userName || order.billingDetails?.name || '',
                actor,
            });
        }
        txn.update(orderRef, {
            status: nextStatus,
            ...extraFields,
            ...(changes.length ? { loyalty: nextLoyalty } : {}),
            updatedAt: serverTimestamp(),
        });
    });
};

/**
 * Pays part of an order with points. `amount` is in rupees; it's rounded
 * down to whole points. Returns the rupee value actually applied.
 * The order fields to update (paidAmount, paymentMethods, status…) are built
 * by the caller from that value and written in the same transaction.
 */
export const redeemPointsOnOrder = async (
    companyId: string,
    orderId: string,
    amount: number,
    settings: LoyaltySettings,
    actor: LoyaltyActor,
    buildOrderUpdate: (appliedValue: number) => Record<string, unknown>,
): Promise<number> => {
    const orderRef = doc(db, 'companies', companyId, 'Orders', orderId);
    return runTransaction(db, async (txn) => {
        const snap = await txn.get(orderRef);
        if (!snap.exists()) throw new Error('Order not found.');
        const order = snap.data() as OrderDoc;
        const phone = orderLoyaltyPhone(order);
        if (!phone) throw new Error('This order has no 10-digit customer phone, so points cannot be used.');

        const value = Number(settings.pointValue) || 1;
        const points = Math.floor(amount / value + 1e-9);
        if (points <= 0) throw new Error(`Enter at least ₹${pointsToRupees(1, settings).toFixed(2)} (1 point).`);
        const appliedValue = pointsToRupees(points, settings);

        const account = await readLoyaltyInTxn(txn, db, companyId, phone);
        const prev = readSaleLoyalty(order);
        // Throws LoyaltyBalanceError when the balance is short — aborts the payment too.
        writeLoyaltyInTxn(txn, db, companyId, account, [{
            type: 'redeem',
            points: -points,
            refType: 'order',
            refId: orderId,
            invoiceNumber: order.orderId || '',
            note: `Paid ₹${appliedValue.toFixed(2)} on online order`,
        }], { name: order.userName || order.billingDetails?.name || '', actor });

        const nextLoyalty: SaleLoyalty = {
            phone,
            earned: prev?.earned ?? 0,
            redeemed: (prev?.redeemed ?? 0) + points,
            redeemValue: Math.round(((prev?.redeemValue ?? 0) + appliedValue) * 100) / 100,
        };
        txn.update(orderRef, { ...buildOrderUpdate(appliedValue), loyalty: nextLoyalty });
        return appliedValue;
    });
};

/**
 * After an order is edited: if it has already earned (it's Completed / Paid),
 * re-work its points from the saved total and apply only the difference.
 * Safe to call after any edit path; does nothing when nothing changed or loyalty is off.
 * Never throws — a points hiccup must not make a saved edit look failed.
 */
export const syncOrderEarnedPoints = async (
    companyId: string,
    orderId: string,
    settings: LoyaltySettings | null | undefined,
    actor: LoyaltyActor,
): Promise<void> => {
    if (!orderLoyaltyOn(settings)) return;
    const orderRef = doc(db, 'companies', companyId, 'Orders', orderId);
    try {
        await runTransaction(db, async (txn) => {
            const snap = await txn.get(orderRef);
            if (!snap.exists()) return;
            const order = snap.data() as OrderDoc;
            if (!isDone(order.status)) return;
            const prev = readSaleLoyalty(order);
            const phone = prev?.phone || orderLoyaltyPhone(order);
            if (!phone) return;

            const redeemValue = prev?.redeemValue ?? 0;
            const earned = calcEarnPoints(Math.max(0, (Number(order.totalAmount) || 0) - redeemValue), settings);
            const delta = earned - (prev?.earned ?? 0);
            if (delta === 0) return;

            const base = { refType: 'edit' as const, refId: orderId, invoiceNumber: order.orderId || '' };
            const change: LoyaltyChange = delta > 0
                ? { ...base, type: 'earn', points: delta, note: 'Online order edited' }
                : { ...base, type: 'reverse', points: delta, note: 'Online order edited', extra: { reverses: 'earn' } };
            const account = await readLoyaltyInTxn(txn, db, companyId, phone);
            writeLoyaltyInTxn(txn, db, companyId, account, [change], {
                name: order.userName || order.billingDetails?.name || '',
                actor,
            });
            txn.update(orderRef, {
                loyalty: { phone, earned, redeemed: prev?.redeemed ?? 0, redeemValue } satisfies SaleLoyalty,
            });
        });
    } catch (err) {
        console.error('Failed to update loyalty points after order edit', err);
    }
};

export { LOYALTY_ORDER_PAYMENT_KEY };
