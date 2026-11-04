import React, { useState, useEffect, useMemo } from 'react';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    orderBy,
    where,
    limit,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { Order } from '../orders.types';
import { formatDate } from '../../../lib/format';

export const useOrdersData = (
    companyId?: string,
    startDate?: Date | null,
    endDate?: Date | null
) => {
    const [Orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Ref to hold both sets independently — no state race
    const dateOrdersRef = React.useRef<Order[]>([]);
    const upcomingOrdersRef = React.useRef<Order[]>([]);

    const mapDoc = React.useCallback((docSnap: any): Order => {
        const data = docSnap.data();
        const createdAt =
            data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : data.createdAt
                    ? new Date(data.createdAt)
                    : new Date(0); // fallback to epoch, NOT current time
        const updatedAt =
            data.updatedAt instanceof Timestamp
                ? data.updatedAt.toDate()
                : data.updatedAt
                    ? new Date(data.updatedAt)
                    : createdAt;
        return {
            id: docSnap.id,
            orderId: data.orderId || '',
            type: data.type || "order",
            isLead: data.isLead || false,
            totalAmount: Number(data.totalAmount || 0),
            totalTax: Number(data.totalTax || 0),      // <-- ADD THIS
            baseAmount: Number(data.baseAmount || 0),
            // Bill-level scheme/tax mode as saved at checkout/edit time — this
            // mapping used to silently drop these two fields entirely (they're
            // genuinely saved in Firestore, just never carried into the
            // in-memory Order object), so every downstream reader — the PDF
            // print pipeline included — saw them as undefined regardless of
            // what the database actually had, and fell back to defaults that
            // happened to match whatever the company's current live settings
            // implied.
            gstScheme: data.gstScheme || '',
            taxType: data.taxType || '',
            paidAmount: Number(data.paidAmount || 0),
            creditNoteAmount: Number(data.creditNoteAmount || 0),
            refundAmount: Number(data.refundAmount || 0),
            status: data.status || 'Upcoming',
            paymentMethod: data.paymentMethod,
            paymentMethods: data.paymentMethods,
            returnHistory: Array.isArray(data.returnHistory) ? data.returnHistory : [],
            specialInstruction: data.specialInstruction || "",
            expenses: Array.isArray(data.expenses) ? data.expenses : [],
            manualDiscount: Number(data.manualDiscount || 0),
            transportDetails: data.transportDetails || undefined,
            updatedAt,
            userName: data.userName || data.billingDetails?.name || 'Anonymous',
            userLoginPhone: data.userLoginPhone || data.billingDetails?.phone || '',
            billingDetails: data.billingDetails,
            shippingDetails: data.shippingDetails,
            createdAt,
            time: formatDate(createdAt),
            items: Array.isArray(data.items)
                ? data.items.map((i: any) => {
                    const salesPrice = Number(i.salesPrice || 0);
                    const mrp = Number(i.mrp || 0);
                    const finalPrice = i.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                    return {
                        id: i.id,
                        itemId: i.itemId || i.id,
                        name: i.name,
                        quantity: Number(i.quantity || 0),
                        mrp,
                        salesPrice,
                        effectiveUnitPrice: i.effectiveUnitPrice, // 👈 Ensures edited price doesn't reset
                        customPrice: i.customPrice,               // 👈 Ensures edited price doesn't reset
                        unitPrice: finalPrice,
                        moq: Number(i.moq ?? 0),
                        itemGroupId: i.itemGroupId || i.groupId || null,
                        tax: Number(i.tax ?? i.taxRate ?? 0),
                        taxRate: Number(i.taxRate ?? i.tax ?? 0),
                        taxType: i.taxType || '',
                        discount: Number(i.discount ?? 0),
                        discount2: Number(i.discount2 ?? 0),                // 👈 CRITICAL: Prevents tax from vanishing!
                        unitMultiplier: Number(i.unitMultiplier ?? i.multiplier ?? 1),
                        unit: i.unit ?? "pcs",
                        finalPrice: Number(i.finalPrice ?? finalPrice * Number(i.quantity || 0)),
                        note: i.note || '',
                        imageUrl: i.imageUrl || "",
                        imageBase64: "",
                    };
                })
                : [],
        };
    }, []);

    // Merges both refs into state — upcoming ref is always the source of truth for Upcoming status
    const mergeAndSet = React.useCallback(() => {
        const upcomingIds = new Set(upcomingOrdersRef.current.map(o => o.id));
        // From date-filtered, exclude anything that's in the upcoming set (upcoming ref is fresher)
        const nonUpcomingFromDate = dateOrdersRef.current.filter(
            o => o.status !== 'Upcoming' && !upcomingIds.has(o.id)
        );
        const filteredUpcoming = upcomingOrdersRef.current.filter(o => {
            if (!startDate || !endDate) return true;
            const orderTime = o.createdAt ? new Date(o.createdAt).getTime() : 0;
            return orderTime >= startDate.getTime() && orderTime <= endDate.getTime();
        });
        const merged = [...nonUpcomingFromDate, ...filteredUpcoming];
        setOrders(merged);
    }, [startDate, endDate]);

    const ordersQuery = useMemo(() => {
        if (!companyId) return null;
        const ordersRef = collection(db, 'companies', companyId, 'Orders');
        if (startDate && endDate) {
            return query(
                ordersRef,
                where('createdAt', '>=', Timestamp.fromDate(startDate)),
                where('createdAt', '<=', Timestamp.fromDate(endDate)),
                orderBy('createdAt', 'desc')
            );
        }
        // No date range passed — cap the unfiltered fallback so a caller that
        // forgets to pass a range can't trigger a full-collection read.
        return query(ordersRef, orderBy('createdAt'), limit(500));
    }, [companyId, startDate?.getTime(), endDate?.getTime()]);

    const upcomingQuery = useMemo(() => {
        if (!companyId) return null;
        const ordersRef = collection(db, 'companies', companyId, 'Orders');
        return query(ordersRef, where('status', '==', 'Upcoming'), limit(1000));
    }, [companyId]);

    // Listener 1: Date-filtered orders (all statuses except upcoming are sourced from here)
    useEffect(() => {
        if (!ordersQuery) {
            dateOrdersRef.current = [];
            setOrders([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const unsub = onSnapshot(
            ordersQuery,
            (snapshot) => {
                dateOrdersRef.current = snapshot.docs.map(mapDoc);
                mergeAndSet();
                setLoading(false);
            },
            () => {
                setError('Failed to load orders');
                setLoading(false);
            }
        );
        return () => unsub();
    }, [ordersQuery, mapDoc, mergeAndSet]);

    // Listener 2: ALL upcoming orders regardless of date — always live
    useEffect(() => {
        if (!upcomingQuery) return;
        const unsub = onSnapshot(
            upcomingQuery,
            (snapshot) => {
                upcomingOrdersRef.current = snapshot.docs.map(mapDoc);
                mergeAndSet();
            },
            (err) => {
                console.error('Upcoming orders listener error:', err);
            }
        );
        return () => unsub();
    }, [upcomingQuery, mapDoc, mergeAndSet]);

    return { Orders, loading, error };
};
