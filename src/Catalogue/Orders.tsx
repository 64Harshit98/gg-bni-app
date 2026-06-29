import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { ACTION } from '../enums/action.enum'
import { useLocation, Link } from 'react-router-dom';
import { db } from '../lib/Firebase';
import QRCode from 'react-qr-code';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../src/constants/routes.constants';
import { GenericCartList } from '../Components/CartItem';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { useDatabase } from '../context/auth-context';
import ShinyText from '../Components/ShinyText';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    orderBy,
    where,
    serverTimestamp,
    increment as firebaseIncrement,
    setDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { CustomCard } from '../Components/CustomCard';
import { Spinner } from '../constants/Spinner';
import { Modal, PaymentModal } from '../constants/Modal';
import { State } from '../enums';
import { FiSearch, FiX } from 'react-icons/fi';
import { IconEdit, IconFilter } from '../constants/Icons';
import type { Item } from '../constants/models';
import { CatalogueBill, prepareCatalogueBillData } from './CatalogueBill/CatalogueBill'
import NotificationBell from '../Components/NotificationBell';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/Firebase'; // Ensure 'storage' is exported from your Firebase config
import { botMasterService } from '../Pages/Additional/Whatsapp/WhatsappApi';
import { FiSend } from 'react-icons/fi';

export interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    mrp: number;
    discount?: number;
    discount2?: number;
    note: string;
    tax?: number;
    itemGroupId?: string;
    purchasePrice?: number;
    stock?: number;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    restockQuantity?: number;
    finalPrice?: number;
    imageBase64?: string;
    imageUrl?: string
    salesPrice?: number
    unit?: string;
    unitMultiplier?: number;
    unitPrice?: number;
    moq?: number;
    itemId?: string;
    taxType?: string;
    effectiveUnitPrice?: number;
    customPrice?: number;
    taxRate?: number;
}

// 1. Updated Status Types
export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed' | 'Completed' | 'Paid' | 'Cancelled';

export interface Order {
    id: string;
    orderId: string;
    totalAmount: number;
    userName: string;
    status: OrderStatus;
    paidAmount?: number;
    creditNoteAmount?: number;
    refundAmount?: number;
    createdAt: Date;
    time: string;
    items?: OrderItem[];
    billingDetails?: {
        address: string;
        phone: string;
        name: string;
        gstin: string;
    };
    shippingDetails?: any;
    userEmail?: string;
    userLoginPhone?: string;
    paymentMethod?: 'Cash' | 'UPI' | 'Card';
    paymentMethods?: { [key: string]: number };
    note?: string;
    specialInstruction?: string;
    manualDiscount?: number;
    discount?: number;
    expenses?: { id: number; name: string; amount: number }[];
    returnHistory?: {
        id: string;
        returnedAt: Date;
        returnedItems: any[];
        exchangeItems: any[];
        finalBalance: number;
        discountDeducted: number;
        modeOfReturn: string;
        paymentDetails?: any;
        partyName?: string;
        partyNumber?: string;
    }[];
    paymentStatus?: string
    updatedAt?: Date;
    type?: string;
    isLead?: boolean;
    totalTax?: number;      // <-- ADD THIS
    baseAmount?: number;
    transportDetails?: {
        transportName: string;
        grRrNo: string;
        grRrDate: string;
        vehicleNo: string;
        stationFrom: string;
        pinCode: string;
    };
}

const formatDate = (date: Date): string => {
    if (!date) return 'N/A';
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    });
};

const formatAmount = (amount: number) => {
    return Number(amount || 0).toLocaleString('en-IN');
};

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
        return query(ordersRef, orderBy('createdAt'));
    }, [companyId, startDate?.getTime(), endDate?.getTime()]);

    const upcomingQuery = useMemo(() => {
        if (!companyId) return null;
        const ordersRef = collection(db, 'companies', companyId, 'Orders');
        return query(ordersRef, where('status', '==', 'Upcoming'));
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

const getDateRange = (
    filter: string,
    customStart?: Date | null,
    customEnd?: Date | null
) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (filter) {
        case 'today':
            return { start, end };

        case 'yesterday': {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
            return { start, end };
        }

        case 'last7': {
            // FIX HERE (7 days total including today)
            start.setDate(start.getDate() - 6);
            return { start, end };
        }

        case 'last30': {
            // Same logic (30 days total)
            start.setDate(start.getDate() - 29);
            return { start, end };
        }

        case 'custom':
            return {
                start: customStart
                    ? new Date(new Date(customStart).setHours(0, 0, 0, 0))
                    : start,
                end: customEnd
                    ? new Date(new Date(customEnd).setHours(23, 59, 59, 999))
                    : end,
            };

        default:
            return { start, end };
    }
};



export const useLiveMoqMapHook = (
    companyId: string | undefined,
    editingOrder: Order | null
): Record<string, number> => {
    const [moqMap, setMoqMap] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!companyId || !editingOrder?.items?.length) {
            setMoqMap({});
            return;
        }

        let cancelled = false;

        const fetchMoqs = async () => {
            const entries: [string, number][] = await Promise.all(
                editingOrder.items!.map(async (item): Promise<[string, number]> => {
                    const itemId = item.itemId || item.id;
                    if (!itemId) return [item.id, 0];

                    try {
                        const itemSnap = await getDoc(
                            doc(db, 'companies', companyId, 'items', itemId)
                        );

                        if (itemSnap.exists()) {
                            const data = itemSnap.data();
                            return [item.id, Number(data.moq ?? 0)];
                        }
                    } catch (err) {
                        console.warn(`[MOQ] fetch failed for ${itemId}:`, err);
                    }

                    return [item.id, 0];
                })
            );

            if (!cancelled) setMoqMap(Object.fromEntries(entries));
        };

        fetchMoqs();
        return () => { cancelled = true; };
    }, [companyId, editingOrder?.id]);

    return moqMap;
};

const NOTIFICATION_SEEN_ORDERS_KEY = "seenOrderNotifications";

const OrdersPage: React.FC = () => {

    // AUDIO REF
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const seenOrdersRef = useRef<Set<string>>(
        new Set(JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_ORDERS_KEY) || "[]"))
    );
    const isInitialNotificationLoadRef = useRef(true);
    const navigate = useNavigate();
    const OrderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];


    const filterRef = useRef<HTMLDivElement>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const location = useLocation();

    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>(
        (location.state?.defaultStatus as OrderStatus) || 'Confirmed'
    );
    const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<any>(null);
    const [_billSettings, setBillSettings] = useState<any>(null);
    const [catalogueWhatsappExtra, setCatalogueWhatsappExtra] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedorderId, setExpandedorderId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    const [selectedOrderForAction, setSelectedOrderForAction] = useState<Order | null>(null);
    const [pdfLoadingOrderId, setPdfLoadingOrderId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'billing' | 'shipping'>('billing');
    const [paymentFilter, setPaymentFilter] = useState<'paid' | 'unpaid'>('unpaid');
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [editExpenses, setEditExpenses] = useState<{ id: number; name: string; amount: number | '' }[]>([]);
    const [editDiscount, setEditDiscount] = useState<number>(0);
    const [editDiscountPercent, setEditDiscountPercent] = useState<number>(0);
    const [showBillDiscountFields, setShowBillDiscountFields] = useState<boolean>(false);
    const [showTransportModal, setShowTransportModal] = useState(false);
    const [transportName, setTransportName] = useState('');
    const [grRrNo, setGrRrNo] = useState('');
    const [grRrDate, setGrRrDate] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [stationFrom, setStationFrom] = useState('');
    const [pinCode, setPinCode] = useState('');

    const hasTransportDetails = !!(transportName || grRrNo || grRrDate || vehicleNo || stationFrom || pinCode);
    const [pendingAdjustment, setPendingAdjustment] = useState<{ amount: number } | null>(null);
    const [showAdjustmentPopup, setShowAdjustmentPopup] = useState(false);
    const [showZeroAmountModal, setShowZeroAmountModal] = useState(false);
    const [pendingZeroOrderId, setPendingZeroOrderId] = useState<string | null>(null);
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [pendingDeleteWarning, setPendingDeleteWarning] = useState<string | null>(null);
    const [pendingDeleteOrderId, setPendingDeleteOrderId] = useState<string | null>(null);
    const [selectedOrderForConfirm, setSelectedOrderForConfirm] = useState<string | null>(null);
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [showQrModal, setShowQrModal] = useState<Order | null>(null);
    const [enableItemWiseDiscount, setEnableItemWiseDiscount] = useState(false);
    const [enableTransportDetails, setEnableTransportDetails] = useState(false);
    const [sendingPdf, setSendingPdf] = useState(false);
    const [showPrintSubMenu, setShowPrintSubMenu] = useState(false);
    const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>(() => {

        if (location.state?.startDate && location.state?.endDate) {

            const start = new Date(location.state.startDate);
            start.setHours(0, 0, 0, 0);

            const end = new Date(location.state.endDate);
            end.setHours(23, 59, 59, 999);

            return { start, end };
        }

        return {
            start: new Date(new Date().setHours(0, 0, 0, 0)),
            end: new Date(new Date().setHours(23, 59, 59, 999))
        };
    });
    const [_itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
    const [_pageIsLoading, setPageIsLoading] = useState(false);
    const dbOperations = useDatabase();
    const [_error, setError] = useState<string | null>(null);
    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [billType, setBillType] = useState<'estimate' | 'bill'>('bill');
    const [pendingRequestCount, setPendingRequestCount] = useState(0);

    const { currentUser } = useAuth();

    // ── Subscription badge ────────────────────────────────────────────────────
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
    const [customerCredit, setCustomerCredit] = useState<number>(0);

    // Fetch customer credit when the Payment Modal opens
    useEffect(() => {
        const fetchCredit = async () => {
            if (!showPaymentModal || !currentUser?.companyId) {
                setCustomerCredit(0);
                return;
            }

            const phone = showPaymentModal.userLoginPhone || showPaymentModal.billingDetails?.phone || '';
            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

            if (normalizedPhone) {
                try {
                    // ✅ Sirf customers collection — advance wahan store ho gaya
                    const customerRef = doc(
                        db,
                        'companies',
                        currentUser.companyId,
                        'customers',
                        normalizedPhone
                    );
                    const snap = await getDoc(customerRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        setEnableItemWiseDiscount(
                            data.enableItemWiseDiscount ?? false
                        );
                        setEnableTransportDetails(
                            data.enableTransportDetails ?? false
                        );
                    }
                } catch (err) {
                    console.error("Error fetching credit balance:", err);
                    setCustomerCredit(0);
                }
            }
        };

        fetchCredit();
    }, [showPaymentModal, currentUser?.companyId]);

    useEffect(() => {
        const fetchExpiry = async () => {
            if (!currentUser?.companyId) return;
            const ref = doc(db, 'companies', currentUser.companyId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const expiry = snap.data().expiryDate;
                if (!expiry) return;
                const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
                setDaysRemaining(Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
            }
        };
        fetchExpiry();
    }, [currentUser?.companyId]);

    const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
    const isUrgent = daysRemaining !== null && daysRemaining <= 2;

    const liveMoqMap = useLiveMoqMapHook(currentUser?.companyId, editingOrder);
    const { Orders, loading: dataLoading, error } = useOrdersData(
        currentUser?.companyId,
        dateRange.start,
        dateRange.end
    );

    useEffect(() => {
        if (isInitialNotificationLoadRef.current) {
            Orders.forEach(order => {
                seenOrdersRef.current.add(order.id);
            });
            localStorage.setItem(
                NOTIFICATION_SEEN_ORDERS_KEY,
                JSON.stringify(Array.from(seenOrdersRef.current))
            );
            isInitialNotificationLoadRef.current = false;
            return;
        }

        let updated = false;

        Orders.forEach(order => {
            const isNewOrder = !seenOrdersRef.current.has(order.id);
            const isActiveOrder = order.status !== 'Cancelled';

            if (isNewOrder && isActiveOrder) {
                // ✅ KEEP THIS: Play the sound
                const audio = audioRef.current;
                if (audio) {
                    audio.currentTime = 0;
                    audio.play().catch((err) => {
                        console.error("Audio play failed:", err);
                    });
                }
                if (isNewOrder && isActiveOrder) {
                    const audio = audioRef.current;
                    if (audio) {
                        audio.currentTime = 0;
                        audio.play().catch((err) => {
                            console.error(err);
                        });
                    }

                    window.dispatchEvent(
                        new CustomEvent('pdc_notification', {
                            detail: {
                                type: 'NEW_ORDER',
                                invoiceNumber: order.orderId,
                                partyName: order.userName || order.billingDetails?.name || 'Customer',
                                amount: Number(order.totalAmount || 0),
                                status: 'UPCOMING',
                                createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),

                                // 🔥 ADD THIS LINE TO PREVENT DUPLICATES 🔥
                                orderDocId: order.id,
                            },
                        })
                    );

                    seenOrdersRef.current.add(order.id);
                    updated = true;
                }
                seenOrdersRef.current.add(order.id);
                updated = true;
            }
        });

        // Update local storage
        if (updated) {
            localStorage.setItem(
                NOTIFICATION_SEEN_ORDERS_KEY,
                JSON.stringify(Array.from(seenOrdersRef.current))
            );
        }
    }, [Orders]);

    const dateFilters = [
        { label: 'Today', value: 'today' },
        { label: 'Yesterday', value: 'yesterday' },
        { label: 'Last 7 Days', value: 'last7' },
        { label: 'Last 30 Days', value: 'last30' },
        { label: 'Custom Range', value: 'custom' },
    ];

    const handleDateFilterSelect = (value: string) => {
        setActiveDateFilter(value);
        if (value !== 'custom') {
            const range = getDateRange(value);
            setDateRange(range);
            setIsFilterOpen(false);
        }
    };

    const handleApplyCustomDate = () => {
        if (customDateRange.start && customDateRange.end) {
            setDateRange({
                start: new Date(customDateRange.start),
                end: new Date(new Date(customDateRange.end).setHours(23, 59, 59))
            });
            setIsFilterOpen(false);
        }
    };


    const getDateDisplay = useMemo(() => {

        if (!dateRange.start || !dateRange.end) return '';

        const format = (d: Date) =>
            d.toLocaleDateString('en-GB');

        if (dateRange.start.toDateString() === dateRange.end.toDateString()) {
            return format(dateRange.start);
        }

        return `${format(dateRange.start)} to ${format(dateRange.end)}`;

    }, [dateRange]);

    useEffect(() => {
        if (location.state?.defaultStatus) {
            setActiveStatusTab(location.state.defaultStatus);
        }
    }, [location.state]);

    const calculatedEditTotal = useMemo(() => {
        if (!editingOrder?.items) return 0;
        let dynamicTax = 0;
        const itemsTotal = editingOrder.items.reduce((sum, item) => {
            const qty = Number(item.quantity || 0);
            const unitPrice = Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
            const rowNet = unitPrice * qty;

            const taxRate = Number(item.tax ?? item.taxRate ?? 0);
            const taxType = (item.taxType || '').toLowerCase();
            if (taxRate > 0 && (taxType === 'exclusive' || taxType === 'regular')) {
                dynamicTax += rowNet * (taxRate / 100);
            }
            return sum + rowNet;
        }, 0);
        const expensesTotal = editExpenses.reduce((sum, e) => sum + (parseFloat(e.amount.toString()) || 0), 0);
        return Math.max(0, itemsTotal + dynamicTax + expensesTotal - editDiscount);
    }, [editingOrder?.items, editExpenses, editDiscount]);

    const handleNetPriceChange = (id: string, value: string) => {
        if (!editingOrder) return;
        const newNetPrice = Number(value) || 0;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);
            const salesPrice = Number(item.salesPrice || 0);
            const basePrice = mrp > 0 ? mrp : salesPrice;

            let discount = 0;
            if (basePrice > 0) {
                discount = ((basePrice - newNetPrice) / basePrice) * 100;
            }

            // Recalculate line total (Base + Tax)
            const qty = Number(item.quantity || 1);
            const taxRate = Number(item.tax ?? item.taxRate ?? 0);
            const taxType = (item.taxType || '').toLowerCase();
            const isExclusive = taxType === 'exclusive' || taxType === 'regular';

            const lineBase = newNetPrice * qty;
            const lineTax = isExclusive ? lineBase * (taxRate / 100) : 0;
            const newFinalPrice = lineBase + lineTax;

            return {
                ...item,
                effectiveUnitPrice: Number(newNetPrice.toFixed(2)),
                customPrice: Number(newNetPrice.toFixed(2)),
                finalPrice: Number(newFinalPrice.toFixed(2)),
                discount: Number(discount.toFixed(2)),
            };
        });

        setEditingOrder({ ...editingOrder, items: updatedItems });
    };

    const mappedOrderItems = (editingOrder?.items || []).map((item) => {
        const dbMrp = Number(item.mrp || 0);
        const salePrice = Number(item.salesPrice || 0);

        // 1. If MRP is 0, use the Sale Price as the base reference so the UI doesn't show "₹0"
        const basePrice = dbMrp > 0 ? dbMrp : salePrice;

        // 2. Extract the pure UNIT price, NEVER the line total (finalPrice)
        let netPrice = item.effectiveUnitPrice ?? item.customPrice ?? salePrice ?? dbMrp ?? 0;

        let discount = Number(item.discount ?? 0);
        const liveMoq = liveMoqMap[item.id] ?? Number(item.moq ?? 0);

        // Only recalculate discount% from net price when there is NO discount2
        // If discount2 exists, trust the stored discount value to avoid cascade corruption
        const discount2 = Number(item.discount2 ?? 0);
        if (basePrice > 0 && netPrice > 0 && discount2 === 0) {
            discount = ((basePrice - netPrice) / basePrice) * 100;
        }

        return {
            ...item,
            productId: item.itemId || item.id,
            isEditable: true,
            discount: Number(discount.toFixed(2)),
            discount2: Number(item.discount2 ?? 0),
            customPrice: Number(netPrice.toFixed(2)), // <-- Ensures CartList uses the Unit Price
            finalPrice: item.finalPrice,              // Keeps the DB Line Total intact
            mrp: basePrice,                           // <-- Fixes the "MRP ₹0" visual bug
            unitMultiplier: Number(item.unitMultiplier || 1),
            moq: liveMoq,
        };
    });

    const handleQuantityChange = (id: string, newQuantity: number) => {
        if (!editingOrder) return;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const moq = Number(item.moq ?? 0);
            const minQty = moq > 0 ? moq : 1;

            let qty = Number(newQuantity);

            if (isNaN(qty) || qty < minQty) qty = minQty;

            return {
                ...item,
                quantity: qty,
            };
        });

        setEditingOrder({
            ...editingOrder,
            items: updatedItems || [],
        });
    };

    const handleDiscountChange = (id: string, value: number | string) => {
        if (!editingOrder) return;
        const discountValue = typeof value === "string" ? parseFloat(value) || 0 : value;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);
            const salesPrice = Number(item.salesPrice || 0);
            const basePrice = mrp > 0 ? mrp : salesPrice;

            // Apply discount1 first
            const priceAfterDiscount1 = basePrice * (1 - discountValue / 100);

            // Then apply discount2 on top of discount1 result
            const discount2 = Number(item.discount2 ?? 0);
            const newNetPrice = priceAfterDiscount1 * (1 - discount2 / 100);

            const taxRate = Number(item.tax || item.taxRate || 0);
            const isExclusive = item.taxType?.toLowerCase() === 'exclusive' || item.taxType?.toLowerCase() === 'regular';
            const newFinalPrice = isExclusive ? newNetPrice + (newNetPrice * (taxRate / 100)) : newNetPrice;

            return {
                ...item,
                discount: Number(discountValue.toFixed(2)),
                effectiveUnitPrice: Number(newNetPrice.toFixed(2)),
                customPrice: Number(newNetPrice.toFixed(2)),
                finalPrice: Number(newFinalPrice.toFixed(2)),
            };
        });

        setEditingOrder({ ...editingOrder, items: updatedItems });
    };
    const handleDiscount2Change = (id: string, value: number | string) => {
        if (!editingOrder) return;
        const discount2Value = typeof value === "string" ? parseFloat(value) || 0 : value;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);
            const salesPrice = Number(item.salesPrice || 0);
            const basePrice = mrp > 0 ? mrp : salesPrice;

            // discount1 stays unchanged — only apply it to get intermediate price
            const discount1 = Number(item.discount ?? 0);
            const priceAfterDiscount1 = basePrice * (1 - discount1 / 100);

            // discount2 applies on priceAfterDiscount1 only
            const newNetPrice = priceAfterDiscount1 * (1 - discount2Value / 100);

            const taxRate = Number(item.tax || item.taxRate || 0);
            const isExclusive = item.taxType?.toLowerCase() === 'exclusive' || item.taxType?.toLowerCase() === 'regular';
            const newFinalPrice = isExclusive
                ? newNetPrice + (newNetPrice * (taxRate / 100))
                : newNetPrice;

            return {
                ...item,
                discount2: Number(discount2Value.toFixed(2)),
                // Do NOT touch item.discount — it stays as is
                effectiveUnitPrice: Number(newNetPrice.toFixed(2)),
                customPrice: Number(newNetPrice.toFixed(2)),
                finalPrice: Number(newFinalPrice.toFixed(2)),
            };
        });

        setEditingOrder({ ...editingOrder, items: updatedItems });
    };
    const handleDeleteItem = (id: string) => {
        if (!editingOrder) return;

        const updatedItems = editingOrder.items?.filter(
            (item) => item.id !== id
        );

        setEditingOrder({
            ...editingOrder,
            items: updatedItems,
        });
    };

    // useEffect(() => {
    //     if (!editingOrder || !currentUser?.companyId) return;

    //     setEditingOrder(prev =>
    //         prev ? { ...prev, totalAmount: calculatedEditTotal } : prev
    //     );
    // }, [calculatedEditTotal]);

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            if (currentUser?.companyId) {
                const companyRef = doc(db, 'companies', currentUser.companyId);
                const companySnap = await getDoc(companyRef);
                if (companySnap.exists()) {
                    setCompanyInfo(companySnap.data());
                }
            }
        };
        fetchCompanyInfo();
    }, [currentUser]);

    useEffect(() => {
        const fetchBillSettings = async () => {
            if (!currentUser?.companyId) return;

            try {
                const ref = doc(
                    db,
                    'companies',
                    currentUser.companyId,
                    'settings',
                    'bill'
                );

                const snap = await getDoc(ref);

                if (snap.exists()) {
                    const data = snap.data();
                    setBillSettings(data);
                    setCatalogueWhatsappExtra(data.catalogueWhatsappExtraMessage || '');
                } else {
                    setBillSettings({});
                    setCatalogueWhatsappExtra('');
                }
            } catch (err) {
                console.error("Bill settings fetch error:", err);
                setBillSettings({});
            }
        };

        fetchBillSettings();
    }, [currentUser?.companyId]);

    useEffect(() => {
        const fetchSalesSettings = async () => {
            if (!currentUser?.companyId) return;

            try {
                const settingsRef = doc(
                    db,
                    "companies",
                    currentUser.companyId,
                    "settings",
                    "catalogue-sales-settings"
                );

                const snap = await getDoc(settingsRef);

                if (snap.exists()) {
                    const data = snap.data();
                    console.log("Sales settings loaded:", data);
                    setEnableItemWiseDiscount(
                        data.enableItemWiseDiscount ?? false
                    );
                    setEnableTransportDetails(
                        data.enableTransportDetails ?? false
                    );
                }
            } catch (error) {
                console.error("Error fetching sales settings:", error);
            }
        };

        fetchSalesSettings();
    }, [currentUser?.companyId]);

    useEffect(() => {
        const fetchData = async () => {
            if (!dbOperations || !currentUser?.companyId) return;
            try {
                setPageIsLoading(true);
                // Sales.tsx wala fast sync logic
                const fetchedItems = await dbOperations.syncItems();
                setAvailableItems(fetchedItems);

                // Item Groups (Categories) fetch logic
                const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
                const groupsSnap = await getDocs(groupsRef);
                const groupMap: Record<string, string> = {};
                groupsSnap.docs.forEach(doc => {
                    const data = doc.data();
                    groupMap[doc.id] = data.name || data.groupName || 'Unknown Group';
                });
                setItemGroupMap(groupMap);
            } catch (err) {
                console.error("Fetch Error:", err);
                setError('Failed to sync data.');
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [dbOperations, currentUser?.companyId]);

    useEffect(() => {
        if (!currentUser?.companyId) return;

        const fetchPendingRequests = async () => {
            try {
                const snap = await getDocs(
                    collection(db, "companies", currentUser.companyId, "AuthorizedUser")
                );

                const pending = snap.docs.filter(
                    (d: any) => d.data()?.status === "pending"
                ).length;

                setPendingRequestCount(pending);
            } catch (err) {
                console.error("Pending request fetch error:", err);
            }
        };

        fetchPendingRequests();
    }, [currentUser?.companyId]);
    // Helper to convert product image URLs to Base64 for jsPDF
    // Helper to convert product image URLs to Base64 for jsPDF
    // Helper to convert product image URLs to Base64 for jsPDF
    // Helper to convert Blob to Base64
    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const convertImageUrlToBase64 = async (url: string, itemName: string): Promise<string> => {
        if (!url) {
            console.warn(`⚠️ [${itemName}] No Image URL provided in the database.`);
            return "";
        }

        try {
            const cacheBuster = url + (url.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();
            const response = await fetch(cacheBuster, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            return await blobToBase64(blob);
        } catch (err) {
            console.warn(`⚠️ [${itemName}] Direct fetch blocked. Trying Proxy...`);
            try {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const proxyResponse = await fetch(proxyUrl);
                if (!proxyResponse.ok) throw new Error(`Proxy HTTP ${proxyResponse.status}`);
                const blob = await proxyResponse.blob();
                return await blobToBase64(blob);
            } catch (proxyErr) {
                console.error(`❌ [${itemName}] Both direct and proxy fetch failed.`);
                return "";
            }
        }
    };
    const handlePdfAction = async (Order: Order, action: ACTION, withDuplicate: boolean = false) => {
        setPdfLoadingOrderId(Order.id);

        try {

            const businessDocRef = doc(
                db,
                'companies',
                currentUser?.companyId || '',
                'business_info',
                currentUser?.companyId || ''
            );

            const businessSnap = await getDoc(businessDocRef);

            const businessData = businessSnap.exists()
                ? businessSnap.data()
                : {};

            const itemsWithBase64 = await Promise.all((Order.items || []).map(async (item: any, index: number) => {
                const mrp = Number(item.mrp || 0);
                const salesPrice = Number(item.salesPrice || 0);
                const actualPrice = item.effectiveUnitPrice ?? item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                // --- THE MAGIC FALLBACK ---
                let targetImageUrl = item.imageUrl;

                // If the order item lacks the image, search the master catalog!
                if (!targetImageUrl) {
                    const catalogItem = availableItems.find(master => String(master.id) === String(item.itemId || item.id));
                    if (catalogItem && catalogItem.imageUrl) {
                        targetImageUrl = catalogItem.imageUrl;
                    }
                }
                // --------------------------


                let base64Image = "";
                if (targetImageUrl) {
                    base64Image = await convertImageUrlToBase64(targetImageUrl, item.name);
                } else {
                    console.warn(`⚠️ 3. Item [${item.name}] has NO imageUrl in both Order AND Catalog.`);
                }

                return {
                    sno: index + 1,
                    name: item.name,
                    qty: item.quantity,
                    unitMultiplier: item.unitMultiplier ?? 1,
                    tax: item.tax ?? 0,
                    mrp: mrp,
                    price: actualPrice,
                    total: actualPrice * item.quantity,
                    imageBase64: base64Image,
                    discount: Number(item.discount ?? 0),
                    discount2: Number(item.discount2 ?? 0),
                };
            }));

            // Fetch previous balance for this customer
            let previousBalance = 0;
            const customerPhone = (Order.billingDetails?.phone || Order.userLoginPhone || '').toString().trim();
            if (currentUser?.companyId && customerPhone) {
                try {
                    const { getDocs, collection, query, where } = await import('firebase/firestore');

                    // 1. Due from other Orders
                    const salesRef = collection(db, 'companies', currentUser.companyId, 'Orders');
                    const snap = await getDocs(query(
                        salesRef,
                        where('userLoginPhone', '==', customerPhone)
                    ));
                    snap.forEach(d => {
                        if (d.id !== Order.id) {
                            const data = d.data();
                            const total = Number(data.totalAmount || 0);
                            const paid = Number(data.paidAmount || 0);
                            const due = Math.max(0, total - paid);
                            previousBalance += due;
                        }
                    });

                    // 2. Due from openingBalances (same party phone)
                    const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');
                    const obSnap = await getDocs(query(
                        obRef,
                        where('partyNumber', '==', customerPhone)
                    ));
                    obSnap.forEach(d => {
                        const data = d.data();
                        // Only 'due' type OB adds to previous balance, 'advance' does not
                        if ((data.balanceType ?? 'due') === 'due') {
                            previousBalance += Number(data.dueAmount ?? data.amount ?? 0);
                        }
                    });

                } catch (e) { console.error('Previous balance fetch error:', e); }
            }
            // Fetch previous balance for this customer
            let wpPreviousBalance = 0;
            const wpCustomerPhone = (Order.billingDetails?.phone || Order.userLoginPhone || '').toString().trim();
            if (currentUser?.companyId && wpCustomerPhone) {
                try {
                    const { getDocs, collection, query, where } = await import('firebase/firestore');

                    // 1. Due from other Orders
                    const salesRef = collection(db, 'companies', currentUser.companyId, 'Orders');
                    const snap = await getDocs(query(
                        salesRef,
                        where('userLoginPhone', '==', wpCustomerPhone)
                    ));
                    snap.forEach(d => {
                        if (d.id !== Order.id) {
                            const data = d.data();
                            const total = Number(data.totalAmount || 0);
                            const paid = Number(data.paidAmount || 0);
                            const due = Math.max(0, total - paid);
                            wpPreviousBalance += due;
                        }
                    });

                    // 2. Due from openingBalances (same party phone)
                    const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');
                    const obSnap = await getDocs(query(
                        obRef,
                        where('partyNumber', '==', wpCustomerPhone)
                    ));
                    obSnap.forEach(d => {
                        const data = d.data();
                        if ((data.balanceType ?? 'due') === 'due') {
                            wpPreviousBalance += Number(data.dueAmount ?? data.amount ?? 0);
                        }
                    });

                } catch (e) { console.error('Previous balance fetch error:', e); }
            }
            const rawBillData = {
                companyId: currentUser?.companyId,
                companyName: companyInfo?.name || "",
                companyAddress: companyInfo?.address || "",
                companyPhone: companyInfo?.ownerPhoneNumber || "",
                placeOfSupply: Order.shippingDetails?.state || "",
                companyGstin: businessData.gstin || "",
                panNumber: businessData.panNumber || "",
                msmeNumber: businessData.msmeUdyamNumber || "",

                bankName: businessData.bankName || "",
                accountName: businessData.accountHolderName || "",
                accountNumber: businessData.accountNumber || "",
                ifscCode: businessData.ifscCode || "",

                specialInstruction: Order.specialInstruction || "",
                transportDetails: Order.transportDetails || null,
                customer: {
                    billing: {
                        name: Order.billingDetails?.name || Order.userName || "Customer",
                        phone: Order.billingDetails?.phone || "",
                        address: Order.billingDetails?.address || "",
                        gstin: Order.billingDetails?.gstin || "",
                    },
                    shipping: {
                        name: Order.shippingDetails?.name || Order.billingDetails?.name || "",
                        phone: Order.shippingDetails?.phone || "",
                        address: Order.shippingDetails?.address || "",
                        gstin: Order.shippingDetails?.gstin || ""
                    }
                },

                order: {
                    orderId: Order.orderId,
                    date: Order.time,
                },

                items: itemsWithBase64,

                grandTotal: Math.max(0, itemsWithBase64.reduce((sum, i) => sum + i.total, 0) + (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0) - Number(Order.manualDiscount || 0)),
                paidAmount: Order.status === 'Paid' ? Math.max(0, itemsWithBase64.reduce((sum, i) => sum + i.total, 0) + (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0) - Number(Order.manualDiscount || 0)) : Number(Order.paidAmount || 0),
                advancePaid: Order.status === 'Paid' ? Math.max(0, itemsWithBase64.reduce((sum, i) => sum + i.total, 0) + (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0) - Number(Order.manualDiscount || 0)) : Number(Order.paidAmount || 0),
                dueAmount: Order.status === 'Paid' ? 0 : Math.max(0, Order.totalAmount - Number(Order.paidAmount || 0)),
                previousBalance: wpPreviousBalance,

                billDiscount: Number(Order.manualDiscount || 0),
                extraExpenseName: (Order.expenses || []).map(e => e.name).join(', '),
                extraExpenseAmount: (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0),
                extraExpenses: (Order.expenses || []).map(e => ({ name: e.name, amount: parseFloat(String(e.amount)) || 0 })),
            };

            const preparedData = await prepareCatalogueBillData({
                ...rawBillData,
                isEstimate: billType === 'estimate'
            });


            if (action === ACTION.PRINT) {
                await CatalogueBill(preparedData, "print", withDuplicate);
            } else if (action === ACTION.DOWNLOAD) {
                await CatalogueBill(preparedData, "download");
            }

        } catch (err) {
            console.error("❌ Catalogue bill error:", err);
        } finally {
            setPdfLoadingOrderId(null);
        }
    };
    const handleSendWhatsapp = async (Order: Order) => {
        const phone = Order.userLoginPhone || Order.billingDetails?.phone || '';
        const name = Order.userName || Order.billingDetails?.name || 'Customer';

        if (!phone) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return;
        }

        setSendingPdf(true);

        try {

            if (!currentUser?.companyId) throw new Error("User context missing.");

            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);

            const businessData = businessSnap.exists()
                ? businessSnap.data()
                : {};

            const { botMasterToken, whatsappNumber } = businessData || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingPdf(false);
                setSelectedOrderForAction(null);
                navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans');
                return;
            }

            // 1. Convert Images
            const itemsWithBase64 = await Promise.all((Order.items || []).map(async (item: any, index: number) => {
                const mrp = Number(item.mrp || 0);
                const salesPrice = Number(item.salesPrice || 0);
                const actualPrice = item.effectiveUnitPrice ?? item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                const base64Image = item.imageUrl ? await convertImageUrlToBase64(item.imageUrl, item.name) : "";
                return {
                    sno: index + 1,
                    name: item.name,
                    qty: item.quantity,
                    unitMultiplier: item.unitMultiplier ?? 1,
                    tax: item.tax ?? 0,
                    mrp: mrp,
                    price: actualPrice,
                    total: actualPrice * item.quantity,
                    imageBase64: base64Image,
                    discount: Number(item.discount ?? 0),
                    discount2: Number(item.discount2 ?? 0),
                };
            }));

            // 2. Construct Raw Bill Data
            const rawBillData = {
                companyId: currentUser?.companyId,
                companyName: companyInfo?.name || "",
                companyAddress: companyInfo?.address || "",
                companyPhone: companyInfo?.ownerPhoneNumber || "",

                companyGstin: businessData.gstin || "",
                panNumber: businessData.panNumber || "",
                msmeNumber: businessData.msmeUdyamNumber || "",

                bankName: businessData.bankName || "",
                accountName: businessData.accountHolderName || "",
                accountNumber: businessData.accountNumber || "",
                ifscCode: businessData.ifscCode || "",

                specialInstruction: Order.specialInstruction || "",
                transportDetails: Order.transportDetails || null,
                placeOfSupply: Order.shippingDetails?.state || "",
                customer: {
                    billing: {
                        name: Order.billingDetails?.name || Order.userName || "Customer",
                        phone: Order.billingDetails?.phone || "",
                        address: Order.billingDetails?.address || "",
                        gstin: Order.billingDetails?.gstin || "",
                    },
                    shipping: {
                        name: Order.shippingDetails?.name || Order.billingDetails?.name || "",
                        phone: Order.shippingDetails?.phone || "",
                        address: Order.shippingDetails?.address || "",
                        gstin: Order.shippingDetails?.gstin || ""
                    }
                },
                order: {
                    orderId: Order.orderId,
                    date: Order.time,
                },
                items: itemsWithBase64,
                grandTotal: Math.max(0, itemsWithBase64.reduce((sum, i) => sum + i.total, 0) + (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0) - Number(Order.manualDiscount || 0)),
                paidAmount: Order.status === 'Paid' ? Math.max(0, itemsWithBase64.reduce((sum, i) => sum + i.total, 0) + (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0) - Number(Order.manualDiscount || 0)) : Number(Order.paidAmount || 0),
                advancePaid: Order.status === 'Paid' ? Math.max(0, itemsWithBase64.reduce((sum, i) => sum + i.total, 0) + (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0) - Number(Order.manualDiscount || 0)) : Number(Order.paidAmount || 0),
                dueAmount: Order.status === 'Paid' ? 0 : Math.max(0, Order.totalAmount - Number(Order.paidAmount || 0)),
            };

            const preparedData = await prepareCatalogueBillData({
                ...rawBillData,
                isEstimate: billType === 'estimate'
            });

            // 3. Generate Blob
            const pdfBlob = await CatalogueBill(preparedData, "blob");
            if (!pdfBlob) throw new Error("Failed to generate PDF Blob.");

            // 4. Upload to Firebase Storage
            const safeNum = Order.orderId.replace(/[\/\\?%*:|"<>]/g, '-');
            const cleanName = `${safeNum}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);

            const fileUrl = await getDownloadURL(storageRef);

            // 5. Send via BotMaster
            const amount = Order.totalAmount;
            const extraMsg = catalogueWhatsappExtra ? `\n\n${catalogueWhatsappExtra}` : '';
            const message = `Hello ${name},\n\nHere is your order bill #${Order.orderId}.\nAmount: ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!${extraMsg}`;

            const response = await botMasterService.sendPdfFromUrl(
                botMasterToken,
                whatsappNumber,
                phone,
                message,
                fileUrl,
                cleanName
            );

            // 6. Cleanup & Verify
            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                const res = response[0];
                if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
            } else if (response.status === 'sent' || response.status === 'success' || response.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                setModal({ message: "Invoice sent!", type: State.SUCCESS });
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (error) { console.warn("Auto-delete failed:", error); }
                }, 60000); // 1 minute cleanup
            } else {
                throw new Error("API reported failure.");
            }

        } catch (err) {
            console.error("WhatsApp Send Error:", err);
            setModal({ message: "Failed to send WhatsApp invoice.", type: State.ERROR });
        } finally {
            setSendingPdf(false);
            setSelectedOrderForAction(null);
        }
    };

    const handleSendReminder = async (Order: Order) => {
        const phone = Order.userLoginPhone || Order.billingDetails?.phone || '';
        const name = Order.userName || Order.billingDetails?.name || 'Customer';

        if (!phone) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return;
        }
        if (!currentUser?.companyId) return;

        setSendingPdf(true);

        try {
            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingPdf(false);
                navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans');
                return;
            }

            const itemsSubtotal = (Order.items || []).reduce((sum, item) => {
                const unitPrice = item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0;
                return sum + (Number(unitPrice) * Number(item.quantity || 0));
            }, 0);
            const orderExpensesTotal = (Order.expenses || []).reduce(
                (sum, ex) => sum + (parseFloat(String(ex.amount)) || 0), 0
            );
            const total = Math.max(0, itemsSubtotal + orderExpensesTotal + Number(Order.totalTax || 0) - Number(Order.manualDiscount || 0));
            const paid = Number(Order.paidAmount || 0);
            const due = Math.max(0, total - paid);

            const dueAmt = due.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
            const totalAmt = total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

            const message = `Dear ${name},\n\nThis is a gentle reminder that an amount of ${dueAmt} is still due against your order #${Order.orderId} (Total: ${totalAmt}).\n\nKindly clear the due amount at your earliest convenience. Thank you!`;

            // --- NEW: Build the bill PDF, same prep as handlePdfAction/handleSendWhatsapp ---
            const businessData = businessSnap.exists() ? businessSnap.data() : {};

            const itemsWithBase64 = await Promise.all((Order.items || []).map(async (item: any, index: number) => {
                const mrp = Number(item.mrp || 0);
                const salesPrice = Number(item.salesPrice || 0);
                const actualPrice = item.effectiveUnitPrice ?? item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                const base64Image = item.imageUrl ? await convertImageUrlToBase64(item.imageUrl, item.name) : "";
                return {
                    sno: index + 1,
                    name: item.name,
                    qty: item.quantity,
                    unitMultiplier: item.unitMultiplier ?? 1,
                    tax: item.tax ?? 0,
                    mrp: mrp,
                    price: actualPrice,
                    total: actualPrice * item.quantity,
                    imageBase64: base64Image,
                    discount: Number(item.discount ?? 0),
                    discount2: Number(item.discount2 ?? 0),
                };
            }));

            const rawBillData = {
                companyId: currentUser?.companyId,
                companyName: companyInfo?.name || "",
                companyAddress: companyInfo?.address || "",
                companyPhone: companyInfo?.ownerPhoneNumber || "",
                companyGstin: businessData.gstin || "",
                panNumber: businessData.panNumber || "",
                msmeNumber: businessData.msmeUdyamNumber || "",
                bankName: businessData.bankName || "",
                accountName: businessData.accountHolderName || "",
                accountNumber: businessData.accountNumber || "",
                ifscCode: businessData.ifscCode || "",
                specialInstruction: Order.specialInstruction || "",
                transportDetails: Order.transportDetails || null,
                placeOfSupply: Order.shippingDetails?.state || "",
                customer: {
                    billing: {
                        name: Order.billingDetails?.name || Order.userName || "Customer",
                        phone: Order.billingDetails?.phone || "",
                        address: Order.billingDetails?.address || "",
                        gstin: Order.billingDetails?.gstin || "",
                    },
                    shipping: {
                        name: Order.shippingDetails?.name || Order.billingDetails?.name || "",
                        phone: Order.shippingDetails?.phone || "",
                        address: Order.shippingDetails?.address || "",
                        gstin: Order.shippingDetails?.gstin || ""
                    }
                },
                order: {
                    orderId: Order.orderId,
                    date: Order.time,
                },
                items: itemsWithBase64,
                grandTotal: total,
                paidAmount: paid,
                advancePaid: paid,
                dueAmount: due,
            };

            const preparedData = await prepareCatalogueBillData({
                ...rawBillData,
                isEstimate: billType === 'estimate'
            });

            const pdfBlob = await CatalogueBill(preparedData, "blob");
            if (!pdfBlob) throw new Error("Failed to generate PDF Blob.");

            const safeNum = Order.orderId.replace(/[\/\\?%*:|"<>]/g, '-');
            const cleanName = `${safeNum}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);

            const fileUrl = await getDownloadURL(storageRef);
            // -------------------------------------------------------------------------------

            const response = await botMasterService.sendPdfFromUrl(
                botMasterToken,
                whatsappNumber,
                phone,
                message,
                fileUrl,
                cleanName
            );

            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                const res = response[0];
                if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                setModal({ message: "Reminder sent via WhatsApp!", type: State.SUCCESS });
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (error) { console.warn("Auto-delete failed:", error); }
                }, 60000);
            } else {
                throw new Error("API reported failure.");
            }
        } catch (err) {
            console.error("Reminder Send Error:", err);
            setModal({ message: "Failed to send reminder.", type: State.ERROR });
        } finally {
            setSendingPdf(false);
        }
    };

    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        if (!selectedItemForEdit || !editingOrder) return;

        const updatePayload: any = { ...updatedItemData };

        // Stock fix
        if (updatePayload.Stock !== undefined) {
            updatePayload.stock = updatePayload.Stock;
            delete updatePayload.Stock;
        }

        Object.keys(updatePayload).forEach((key) => {
            if (updatePayload[key] === undefined) delete updatePayload[key];
        });

        const updatedItems = (editingOrder.items || []).map((item) => {
            if (String(item.id) === String(selectedItemForEdit.id)) {
                const mergedItem = { ...item, ...updatePayload };

                const mrp = Number(mergedItem.mrp || 0);
                const salesPrice = Number(mergedItem.salesPrice || 0);
                const presetDiscount = Number(mergedItem.discount || 0);

                let finalNetPrice = 0;
                let calculatedDiscount = 0;

                // --- 3-TIER LOGIC ---
                if (mrp > 0 && salesPrice > 0) {
                    finalNetPrice = salesPrice;
                    calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
                } else if (salesPrice > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = salesPrice * (1 - (presetDiscount / 100));
                } else if (mrp > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = mrp * (1 - (presetDiscount / 100));
                }

                // Using toFixed(2) as a fallback since applyRounding isn't imported here
                mergedItem.finalPrice = Number(finalNetPrice.toFixed(2));
                mergedItem.discount = Number(calculatedDiscount.toFixed(2));

                return mergedItem;
            }
            return item;
        });

        let dynamicTax = 0;
        const itemsBaseTotal = updatedItems.reduce((sum, item) => {
            const qty = Number(item.quantity || 0);
            const unitPrice = Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
            const rowNet = unitPrice * qty;

            const taxRate = Number(item.tax ?? item.taxRate ?? 0);
            const taxType = (item.taxType || '').toLowerCase();
            if (taxRate > 0 && (taxType === 'exclusive' || taxType === 'regular')) {
                dynamicTax += rowNet * (taxRate / 100);
            }
            return sum + rowNet;
        }, 0);

        const expensesTotal = (editingOrder.expenses || []).reduce((sum: number, e: any) => sum + (parseFloat(e.amount?.toString()) || 0), 0);
        const finalNewTotal = Math.max(0, itemsBaseTotal + dynamicTax + expensesTotal - Number(editingOrder.manualDiscount || 0));

        setEditingOrder((prev) =>
            prev ? { ...prev, items: updatedItems, totalAmount: finalNewTotal } : prev
        );

        if (currentUser?.companyId) {
            const orderRef = doc(db, "companies", currentUser.companyId, "Orders", editingOrder.id);

            // Sweep undefined values from the items array so Firebase doesn't crash
            const safeItems = updatedItems.map(item => {
                const safeItem = { ...item };
                Object.keys(safeItem).forEach(key => {
                    if (safeItem[key as keyof typeof safeItem] === undefined) {
                        delete safeItem[key as keyof typeof safeItem];
                    }
                });
                return safeItem;
            });

            updateDoc(orderRef, {
                items: safeItems,
                totalAmount: finalNewTotal,
                totalTax: dynamicTax, // Ensure DB has updated tax
                updatedAt: serverTimestamp(),
            });
        }

        setIsEditDrawerOpen(false);
        setSelectedItemForEdit(null);
    };



    const statusCounts = useMemo(() => {
        return OrderStatuses.reduce((acc, status) => {

            //  Completed = Completed + Paid
            if (status === "Completed") {
                acc[status] = Orders.filter(
                    o => o.status === "Completed" || o.status === "Paid"
                ).length;
            } else {
                acc[status] = Orders.filter(
                    o => o.status === status
                ).length;
            }

            return acc;
        }, {} as Record<string, number>);
    }, [Orders, OrderStatuses]);

    useEffect(() => {
        let unsubscribeItems: () => void;
        if (dbOperations) {
            unsubscribeItems = dbOperations.listenToItems((data) => {
                setAvailableItems(data);
            });
        }
        return () => {
            if (unsubscribeItems) unsubscribeItems();
        };
    }, [dbOperations]);

    // 3. Simplified Filter (No toggle dependency)
    const filteredOrders = useMemo(() => {

        let result = Orders
            .filter(order => {

                if (activeStatusTab === "Upcoming") {
                    if (order.status !== "Upcoming") return false;
                    // For lead/upcoming orders, only show if they have items
                    // For confirmed cart orders (isLead: false), always show
                    if (order.isLead) {
                        return (order.items?.length || 0) > 0;
                    }
                    return true;
                }

                //  COMPLETED TAB
                if (activeStatusTab === 'Completed') {
                    if (paymentFilter === 'unpaid') {
                        return order.status === 'Completed';
                    }
                    return order.status === 'Paid';
                }

                //  NORMAL TABS (Confirmed, Packed)
                return order.status === activeStatusTab;
            })

            .filter(order => {
                const q = searchQuery.toLowerCase();
                return (
                    order.orderId?.toLowerCase().includes(q) ||
                    order.userName?.toLowerCase().includes(q) ||
                    order.userLoginPhone?.toLowerCase().includes(q) ||
                    order.billingDetails?.phone?.toLowerCase().includes(q) ||
                    order.billingDetails?.name?.toLowerCase().includes(q) ||
                    order.shippingDetails?.phone?.toLowerCase().includes(q) ||
                    order.shippingDetails?.name?.toLowerCase().includes(q)
                );
            });

        //  Paid tab me latest order upar
        if (activeStatusTab === 'Completed' && paymentFilter === 'paid') {
            result = result.sort((a, b) => {
                const aTime = a.updatedAt
                    ? new Date(a.updatedAt).getTime()
                    : new Date(a.createdAt).getTime();

                const bTime = b.updatedAt
                    ? new Date(b.updatedAt).getTime()
                    : new Date(b.createdAt).getTime();

                return bTime - aTime;
            });
        }

        // Sort: latest first for all tabs
        return result.sort((a, b) => {
            const getTime = (o: Order) => {
                if (activeStatusTab === 'Upcoming') {
                    return new Date(o.createdAt).getTime();
                }
                return o.updatedAt
                    ? new Date(o.updatedAt).getTime()
                    : new Date(o.createdAt).getTime();
            };
            return getTime(b) - getTime(a);
        });

    }, [Orders, activeStatusTab, paymentFilter, searchQuery]);

    const handleOrderClick = (uiKey: string) => {
        setExpandedorderId(prevId => (prevId === uiKey ? null : uiKey));
    };

    const handleDeleteOrder = async (orderId: string, skipConfirm = false) => {
        if (!skipConfirm) {
            setPendingDeleteOrderId(orderId);

            // Fetch order data to build warning message
            if (currentUser?.companyId) {
                try {
                    const orderRef = doc(db, "companies", currentUser.companyId, "Orders", orderId);
                    const orderSnap = await getDoc(orderRef);
                    if (orderSnap.exists()) {
                        const orderData = orderSnap.data();

                        // Case-insensitive lookup across all payment method keys
                        const creditNotePayment = Object.entries(orderData.paymentMethods || {})
                            .filter(([key]) => key.toLowerCase().includes('credit note') || key.toLowerCase() === 'credit')
                            .reduce((sum, [, val]) => sum + Number(val || 0), 0);

                        const hasCreditNoteReturns = (orderData.returnHistory || []).some((h: any) =>
                            h.modeOfReturn?.toLowerCase().includes('credit note')
                        );

                        let warningMessage = "Are you sure you want to delete this order?";

                        if (creditNotePayment > 0) {
                            warningMessage += `. This order was paid using Credit Note of ${creditNotePayment.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}. The credit note balance will be restored to the customer`;
                        }

                        if (hasCreditNoteReturns) {
                            const creditNoteReturnAmount = (orderData.returnHistory || [])
                                .filter((h: any) => h.modeOfReturn?.toLowerCase().includes('credit note'))
                                .reduce((sum: number, h: any) => sum + (Number(h.finalBalance) || 0), 0);

                            if (creditNotePayment > 0) {
                                warningMessage += ` and the returned items' Credit Note of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} will be removed from the customer`;
                            } else {
                                warningMessage += `. This order contains Credit Note returns of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} which will be removed from the customer`;
                            }
                        }

                        warningMessage += ".";

                        // Store the custom message to show in the modal
                        setPendingDeleteWarning(warningMessage);
                    }
                } catch (err) {
                    console.error("Warning fetch error:", err);
                    setPendingDeleteWarning(null);
                }
            }

            setShowDeleteConfirmModal(true);
            return;
        }
        if (!currentUser?.companyId) return;

        try {
            const companyId = currentUser.companyId;

            const orderRef = doc(db, "companies", companyId, "Orders", orderId);
            const orderSnap = await getDoc(orderRef);

            if (!orderSnap.exists()) {
                throw new Error("Order not found");
            }

            const orderData = orderSnap.data();
            const items = orderData.items || [];


            // Restore stock
            for (const item of items) {
                const itemId = item.itemId || item.id;
                if (!itemId) {
                    console.warn(" Missing itemId:", item);
                    continue;
                }

                const itemRef = doc(
                    db,
                    "companies",
                    companyId,
                    "items",
                    itemId
                );

                const itemSnap = await getDoc(itemRef);

                if (!itemSnap.exists()) {
                    console.warn("Item not found:", itemId);
                    continue;
                }

                const currentStock = Number(itemSnap.data().stock || 0);
                const restoreQty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);

                await updateDoc(itemRef, {
                    stock: currentStock + restoreQty,
                });

                // Tell MyShop to increase the stock in the UI
                window.dispatchEvent(new CustomEvent('local_stock_update', {
                    detail: {
                        itemId: String(itemId),
                        delta: restoreQty
                    }
                }));
            }
            // ── Credit Note Adjustment ─────────────────────────────────────────
            // Credit used to PAY this order → restore it back to customer on delete
            const creditNotePayment = Object.entries(orderData.paymentMethods || {})
                .filter(([key]) => key.toLowerCase().includes('credit note') || key.toLowerCase() === 'credit')
                .reduce((sum, [, val]) => sum + Number(val || 0), 0);

            const creditNoteReturns = (orderData.returnHistory || [])
                .filter((h: any) => h.modeOfReturn?.toLowerCase().includes('credit note'))
                .reduce((sum: number, h: any) => sum + (Number(h.finalBalance) || 0), 0);
            const netCreditAdjustment = creditNotePayment - creditNoteReturns;

            const partyPhone = (orderData.userLoginPhone || orderData.billingDetails?.phone || '')
                .replace(/\D/g, '').slice(-10);

            if (netCreditAdjustment !== 0 && partyPhone) {
                const customerRef = doc(db, 'companies', companyId, 'customers', partyPhone);
                await updateDoc(customerRef, {
                    creditBalance: firebaseIncrement(netCreditAdjustment)
                }).catch(() => {
                    // Customer doc may not exist — safe to ignore
                });
            }
            // ──────────────────────────────────────────────────────────────────
            // Delete order
            await deleteDoc(orderRef);

            // setModal({
            //     message: "Order deleted successfully",
            //     type: State.SUCCESS,
            // });
        } catch (error) {
            console.error("Delete Order Error:", error);
            setModal({
                message: "Failed to delete order",
                type: State.ERROR,
            });
        }
    };

    const handleUpdateStatus = async (
        orderId: string,
        currentStatus: OrderStatus,
        manualNextStatus?: OrderStatus
    ) => {
        if (currentStatus === 'Packed' && !manualNextStatus) {
            setSelectedOrderForConfirm(orderId);
            return;
        }
        setIsUpdatingStatus(orderId);

        try {
            if (!currentUser?.companyId) return;

            const OrderRef = doc(
                db,
                "companies",
                currentUser.companyId,
                "Orders",
                orderId
            );

            // Fetch the latest order data to make smart status decisions
            const orderSnap = await getDoc(OrderRef);
            if (!orderSnap.exists()) return;
            const orderData = orderSnap.data();

            const nextStatusMap: Record<OrderStatus, OrderStatus> = {
                Upcoming: "Confirmed",
                Confirmed: "Packed",
                Packed: "Completed",
                Completed: "Completed",
                Paid: "Paid",
                Cancelled: 'Cancelled',
            };

            let nextStatus = manualNextStatus || nextStatusMap[currentStatus];

            // --- THE FIX ---
            // If moving out of Packed, check if it's already fully paid via Advance
            if (currentStatus === "Packed" && nextStatus === "Completed") {
                const total = Number(orderData.totalAmount || 0);
                const paid = Number(orderData.paidAmount || 0);

                // If Due is 0 (using <= 0.1 to prevent JS decimal bugs), skip Unpaid and go to Paid
                if ((total - paid) <= 0.1) {
                    nextStatus = "Paid";
                }
            }

            //  STOCK DECREASE WHEN CONFIRMED
            // Skip for cart orders — they already deducted stock at placement
            if (nextStatus === "Confirmed") {
                const freshSnap = await getDoc(OrderRef);
                const freshData = freshSnap.data();
                const wasPlacedViaCart = !!freshData?.orderedBy;

                if (!wasPlacedViaCart) {
                    const items = freshData?.items || [];

                    await Promise.all(
                        items.map(async (item: any) => {
                            try {
                                const itemId = item.itemId || item.id;
                                if (!itemId) return;

                                const itemRef = doc(
                                    db,
                                    "companies",
                                    currentUser.companyId,
                                    "items",
                                    itemId
                                );

                                const snap = await getDoc(itemRef);
                                if (!snap.exists()) {
                                    return;
                                }

                                const currentStock = Number(snap.data().stock || 0);

                                const deductQty =
                                    Number(item.quantity || 0) *
                                    Number(item.unitMultiplier || 1);

                                await updateDoc(itemRef, {
                                    stock: currentStock - deductQty
                                });

                            } catch (err) {
                                console.error("Stock update failed:", err);
                            }
                        })
                    );
                }
            }

            await updateDoc(OrderRef, {
                status: nextStatus,
                isLead: false,
                updatedAt: serverTimestamp()
            });

        } catch (err) {
            console.error("Error updating status:", err);
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const handlePreviousStatus = async (
        orderId: string,
        currentStatus: OrderStatus
    ) => {

        const prevStatusMap: Record<OrderStatus, OrderStatus> = {
            Upcoming: "Upcoming",
            Confirmed: "Confirmed",
            Packed: "Confirmed",
            Completed: "Packed",
            Paid: "Completed",
            Cancelled: 'Cancelled',
        };

        const prevStatus = prevStatusMap[currentStatus];

        if (!currentUser?.companyId) return;

        const OrderRef = doc(
            db,
            "companies",
            currentUser.companyId,
            "Orders",
            orderId
        );

        await updateDoc(OrderRef, {
            status: prevStatus,
            updatedAt: serverTimestamp()
        });
    };

    const handleSaveChanges = async () => {
        if (!editingOrder || !currentUser?.companyId) return;
        // ── Zero-amount guard ──────────────────────────────────────────────────
        const itemsOnlyTotal = (editingOrder.items || []).reduce((sum, item) => {
            // FIX: finalPrice is already the line total
            if (item.finalPrice !== undefined && item.finalPrice !== null) {
                return sum + Number(item.finalPrice);
            }
            const unitPrice = item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0;
            return sum + (Number(unitPrice) * Number(item.quantity || 0));
        }, 0);
        const expensesTotal = editExpenses.reduce((sum, e) => sum + (parseFloat(e.amount.toString()) || 0), 0);
        const preCheckTotal = Math.max(0, itemsOnlyTotal + expensesTotal - editDiscount);

        if (preCheckTotal <= 0) {
            setPendingZeroOrderId(editingOrder.id);
            setShowZeroAmountModal(true);
            return;
        }
        // ──────────────────────────────────────────────────────────────────────
        try {
            const companyId = currentUser.companyId;
            const orderRef = doc(db, 'companies', companyId, 'Orders', editingOrder.id);
            const liveOrderSnap = await getDoc(orderRef);
            const originalOrder = liveOrderSnap.exists()
                ? ({ id: editingOrder.id, ...(liveOrderSnap.data() as any) } as any)
                : Orders.find(o => o.id === editingOrder.id);

            const getItemsTotal = (items: any[] = [], expenses: any[] = [], discount: number = 0) => {
                let dynamicTax = 0;
                const base = items.reduce((sum, item) => {
                    const qty = Number(item.quantity || 0);
                    const unitPrice = Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
                    const rowNet = unitPrice * qty;

                    const taxRate = Number(item.tax ?? item.taxRate ?? 0);
                    const taxType = (item.taxType || '').toLowerCase();
                    if (taxRate > 0 && (taxType === 'exclusive' || taxType === 'regular')) {
                        dynamicTax += rowNet * (taxRate / 100);
                    }
                    return sum + rowNet;
                }, 0);
                const exp = expenses.reduce((sum: number, e: any) => sum + (parseFloat(e.amount?.toString()) || 0), 0);
                return Math.max(0, base + dynamicTax + exp - discount);
            };

            // Calculate exact tax separately so we can save it to DB
            const newTotalTax = (editingOrder.items || []).reduce((sum, item) => {
                const qty = Number(item.quantity || 0);
                const unitPrice = Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
                const taxRate = Number(item.tax ?? item.taxRate ?? 0);
                const taxType = (item.taxType || '').toLowerCase();
                if (taxRate > 0 && (taxType === 'exclusive' || taxType === 'regular')) {
                    return sum + (unitPrice * qty * (taxRate / 100));
                }
                return sum;
            }, 0);


            // Compare item-based totals so increase/decrease detection is always correct,
            // even if stored totalAmount was stale.
            // Compare totals including expenses/discount
            const originalTotal = Number(getItemsTotal(
                originalOrder?.items || [],
                Array.isArray(originalOrder?.expenses) ? originalOrder.expenses : [],
                Number(originalOrder?.manualDiscount || 0)
            ));
            const newTotal = Number(getItemsTotal(editingOrder.items || [], editExpenses, editDiscount));
            const netDiff = newTotal - originalTotal;

            // ── Stock delta calculation (same logic as EditOrderModal) ──────────
            const oldQuantities = new Map<string, number>();
            (originalOrder?.items || []).forEach((oldItem: any) => {
                const pid = oldItem.itemId || oldItem.id;
                const qty = Number(oldItem.quantity || 0) * Number(oldItem.unitMultiplier || 1);
                oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + qty);
            });

            const newQuantities = new Map<string, number>();
            (editingOrder.items || []).forEach((item: any) => {
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    newQuantities.set(pid, (newQuantities.get(pid) || 0) + qty);
                }
            });

            const allPids = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);

            // ── Helper: build the Firestore update payload ──────────────────────
            const buildUpdatePayload = (extraFields: Record<string, any> = {}) => {

                // 1. Sweep undefined values from the items array
                const safeItems = (editingOrder.items || []).map(item => {
                    const safeItem = { ...item };
                    Object.keys(safeItem).forEach(key => {
                        if (safeItem[key as keyof typeof safeItem] === undefined) {
                            delete safeItem[key as keyof typeof safeItem];
                        }
                    });
                    return safeItem;
                });

                // 2. Build the payload with safety fallbacks for optional fields
                const payload: any = {
                    items: safeItems,
                    totalAmount: newTotal,
                    totalTax: newTotalTax,
                    manualDiscount: editDiscount,
                    expenses: editExpenses.map(({ id, name, amount }) => ({ id, name, amount: parseFloat(amount.toString()) || 0 })),
                    billingDetails: editingOrder.billingDetails || null,
                    shippingDetails: editingOrder.shippingDetails || null,
                    userName: editingOrder.billingDetails?.name || editingOrder.userName || "",
                    userLoginPhone: editingOrder.billingDetails?.phone || editingOrder.userLoginPhone || "",
                    transportDetails: hasTransportDetails ? {
                        transportName: transportName.trim(),
                        grRrNo: grRrNo.trim(),
                        grRrDate: grRrDate.trim(),
                        vehicleNo: vehicleNo.trim(),
                        stationFrom: stationFrom.trim(),
                        pinCode: pinCode.trim(),
                    } : null,
                    updatedAt: serverTimestamp(),
                    ...extraFields,
                };

                // 3. Final top-level sweep to guarantee no undefined values leak through
                Object.keys(payload).forEach(key => {
                    if (payload[key] === undefined) delete payload[key];
                });

                return payload;
            };

            // ── Helper: resolve status after amount change ──────────────────────
            // Replace your existing resolveStatus inside handleSaveChanges with this:
            const resolveStatus = (total: number, paid: number) => {
                const liveStatus = originalOrder?.status || editingOrder.status;

                // RULE 1: Never auto-move from Confirmed or Packed on edit.
                if (liveStatus !== 'Completed' && liveStatus !== 'Paid') {
                    return liveStatus;
                }

                // RULE 2: Auto-move ONLY between Completed (Unpaid) and Paid
                const effectiveDue = total - paid;
                if (effectiveDue <= 0.1) { // 0.1 handles JavaScript float precision bugs
                    return 'Paid';
                } else {
                    return 'Completed';
                }
            };

            // ── Stock updates (runs for all cases) ─────────────────────────────
            const stockUpdatePromises: Promise<void>[] = [];
            allPids.forEach(pid => {
                const diff = (newQuantities.get(pid) || 0) - (oldQuantities.get(pid) || 0);
                if (diff !== 0) {
                    const itemRef = doc(db, 'companies', companyId, 'items', pid);
                    stockUpdatePromises.push(
                        updateDoc(itemRef, {
                            stock: firebaseIncrement(-diff), // sold more → stock decreases
                            updatedAt: serverTimestamp(),
                        })
                    );
                }
            });

            // CASE 1: Amount reduced -> check due before offering refund (stock still updates)
            const originalPaid = Number(originalOrder?.paidAmount || 0);
            const originalDue = Math.max(0, originalTotal - originalPaid);
            const priceReduction = Math.abs(netDiff);
            const expensesPayload = editExpenses.map(({ id, name, amount }) => ({
                id,
                name,
                amount: parseFloat(amount.toString()) || 0,
            }));
            if (netDiff < 0) {

                if (priceReduction <= originalDue) {
                    // CASE 1A: The reduction just eats into the unpaid Due. 
                    // No refund/credit note needed. Just save the new total.
                    await Promise.all([
                        ...stockUpdatePromises,
                        updateDoc(orderRef, buildUpdatePayload({
                            status: resolveStatus(newTotal, originalPaid)
                        })),
                    ]);
                    setEditingOrder(null);
                    setModal({ message: 'Due reduced successfully.', type: State.SUCCESS });
                    return;
                } else {
                    // CASE 1B: The reduction wipes out the Due and digs into the Paid amount.
                    // We ONLY refund the leftover difference.
                    const refundableAmount = priceReduction - originalDue;
                    await Promise.all([
                        ...stockUpdatePromises,
                        updateDoc(orderRef, {
                            expenses: expensesPayload,
                            manualDiscount: editDiscount,
                            transportDetails: hasTransportDetails ? {
                                transportName: transportName.trim(),
                                grRrNo: grRrNo.trim(),
                                grRrDate: grRrDate.trim(),
                                vehicleNo: vehicleNo.trim(),
                                stationFrom: stationFrom.trim(),
                                pinCode: pinCode.trim(),
                            } : null,
                            updatedAt: serverTimestamp(),
                        }),
                    ]);

                    setPendingAdjustment({ amount: refundableAmount });
                    setShowAdjustmentPopup(true);
                    return;
                }
            }

            // CASE 2: Amount increased
            if (netDiff > 0) {
                await Promise.all([
                    ...stockUpdatePromises,
                    updateDoc(orderRef, buildUpdatePayload({
                        status: resolveStatus(newTotal, originalPaid), // <--- FIXED
                        extraDueAmount: netDiff,
                    })),
                ]);
                setEditingOrder(null);
                setModal({ message: `Due Increased: ₹${netDiff.toFixed(2)}`, type: State.SUCCESS });
                return;
            }

            // CASE 3: No amount change (items/qty may still have changed)
            await Promise.all([
                ...stockUpdatePromises,
                updateDoc(orderRef, buildUpdatePayload({
                    status: resolveStatus(newTotal, originalPaid) // <--- FIXED
                })),
            ]);
            setEditingOrder(null);

        } catch (error) {
            console.error('Save error:', error);
            setModal({ message: 'Failed to save changes.', type: State.ERROR });
        }
    };

    // {
    //     isGeneratingPdf && (
    //         <div className="fixed inset-0 z-[5000] bg-black/40 flex items-center justify-center">
    //             <div className="bg-white px-6 py-4 rounded-sm shadow-lg flex items-center gap-3">
    //                 <Spinner />
    //                 <span className="text-sm font-bold text-slate-700">
    //                     Generating PDF...
    //                 </span>
    //             </div>
    //         </div>
    //     )
    // }
    // --- Adjustment Handlers ---
    const handleCreditNote = async () => {
        if (!editingOrder || !currentUser?.companyId || !pendingAdjustment) return;

        const liveOrder = Orders.find(o => o.id === editingOrder.id);
        let dynamicTax = 0;
        const baseItemsTotal = (editingOrder.items || []).reduce((sum, item) => {
            const qty = Number(item.quantity || 0);
            const unitPrice = Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
            const rowNet = unitPrice * qty;

            const taxRate = Number(item.tax ?? item.taxRate ?? 0);
            const taxType = (item.taxType || '').toLowerCase();
            if (taxRate > 0 && (taxType === 'exclusive' || taxType === 'regular')) {
                dynamicTax += rowNet * (taxRate / 100);
            }
            return sum + rowNet;
        }, 0);
        const expensesTotal = (editingOrder.expenses || []).reduce((sum: number, e: any) => sum + (parseFloat(e.amount?.toString()) || 0), 0);
        const totalAmt = Math.max(0, baseItemsTotal + dynamicTax + expensesTotal - Number(editingOrder.manualDiscount || 0));
        const paidAmt = Number(liveOrder?.paidAmount || 0);
        const updatedPaidAmt = Math.max(0, paidAmt - pendingAdjustment.amount);
        const effectiveDue = Math.max(0, totalAmt - updatedPaidAmt);

        // --- SMART STATUS LOGIC ---
        const liveStatus = liveOrder?.status || editingOrder.status;
        let updatedStatus = liveStatus;

        // Only alter the status if it's already in the final stages
        if (liveStatus === 'Completed' || liveStatus === 'Paid') {
            updatedStatus = effectiveDue > 0.1 ? 'Completed' : 'Paid';
        }
        // --------------------------

        await updateDoc(
            doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id),
            {
                items: editingOrder.items,
                totalAmount: totalAmt,
                paidAmount: updatedPaidAmt,
                status: updatedStatus, // Uses the smart status
                billingDetails: editingOrder.billingDetails,
                shippingDetails: editingOrder.shippingDetails,
                creditNoteAmount: firebaseIncrement(pendingAdjustment.amount),
                updatedAt: serverTimestamp(),
            }
        );

        // Credit balance update (your existing customer code stays the same)
        try {
            const normalizePhone = (num: string) => num.replace(/\D/g, '').slice(-10);
            const rawNumber = editingOrder.userLoginPhone || editingOrder.billingDetails?.phone || '';
            const customerIdentifier = normalizePhone(rawNumber);
            if (customerIdentifier) {
                const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', customerIdentifier);
                const customerName = editingOrder.userName || editingOrder.billingDetails?.name || '';
                await setDoc(customerRef, {
                    number: customerIdentifier,
                    name: customerName,
                    creditBalance: firebaseIncrement(pendingAdjustment.amount),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
        } catch (err) {
            console.error("Failed to update customer credit balance:", err);
        }

        setShowAdjustmentPopup(false);
        setPendingAdjustment(null);
        setEditingOrder(null);
        setModal({ message: `Credit Note: ₹${pendingAdjustment.amount.toFixed(2)} added`, type: State.SUCCESS });
    };
    const handleRefund = async () => {
        if (!editingOrder || !currentUser?.companyId || !pendingAdjustment) return;

        const liveOrder = Orders.find(o => o.id === editingOrder.id);
        let dynamicTax = 0;
        const baseItemsTotal = (editingOrder.items || []).reduce((sum, item) => {
            const qty = Number(item.quantity || 0);
            const unitPrice = Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
            const rowNet = unitPrice * qty;

            const taxRate = Number(item.tax ?? item.taxRate ?? 0);
            const taxType = (item.taxType || '').toLowerCase();
            if (taxRate > 0 && (taxType === 'exclusive' || taxType === 'regular')) {
                dynamicTax += rowNet * (taxRate / 100);
            }
            return sum + rowNet;
        }, 0);
        const expensesTotal = (editingOrder.expenses || []).reduce((sum: number, e: any) => sum + (parseFloat(e.amount?.toString()) || 0), 0);
        const totalAmt = Math.max(0, baseItemsTotal + dynamicTax + expensesTotal - Number(editingOrder.manualDiscount || 0));
        const paidAmt = Number(liveOrder?.paidAmount || 0);
        const updatedPaidAmt = Math.max(0, paidAmt - pendingAdjustment.amount);
        const effectiveDue = Math.max(0, totalAmt - updatedPaidAmt);

        // --- SMART STATUS LOGIC ---
        const liveStatus = liveOrder?.status || editingOrder.status;
        let updatedStatus = liveStatus;

        // Only alter the status if it's already in the final stages
        if (liveStatus === 'Completed' || liveStatus === 'Paid') {
            updatedStatus = effectiveDue > 0.1 ? 'Completed' : 'Paid';
        }
        // --------------------------

        await updateDoc(
            doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id),
            {
                items: editingOrder.items,
                totalAmount: totalAmt,
                paidAmount: updatedPaidAmt,
                status: updatedStatus, // Uses the smart status
                billingDetails: editingOrder.billingDetails,
                shippingDetails: editingOrder.shippingDetails,
                refundAmount: firebaseIncrement(pendingAdjustment.amount),
                updatedAt: serverTimestamp(),
            }
        );

        setShowAdjustmentPopup(false);
        setPendingAdjustment(null);
        setEditingOrder(null);
        setModal({ message: `Refund: ₹${pendingAdjustment.amount.toFixed(2)} processed`, type: State.SUCCESS });
    };

    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-100 mb-10">
            {showBadge && (
                <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
                    <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
                    <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
                </div>
            )}
            {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

            {/* --- 5. UPDATED HEADER (No Toggle) --- */}
            <div className="bg-white shadow-sm sticky top-0 z-[100] px-4 py-2">
                {/* Main Header Row */}
                <div className="flex items-center justify-between">
                    {/* Left: Search Icon - Changed w-10 to w-24 and added flex justify-start */}
                    <div className="w-24 flex justify-start">
                        <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500">
                            {showSearch ? <FiX className="w-6 h-6" /> : <FiSearch className="w-6 h-6" />}
                        </button>
                    </div>

                    {/* Center: Title & Search Input */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                        {showSearch ? (
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full max-w-[200px] text-center text-sm font-light p-1 border-b border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        ) : (
                            <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
                        )}

                        {/* Date Filter - Just below Header */}
                        <div className="mt-0.5">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                {getDateDisplay}
                            </span>
                        </div>
                    </div>

                    {/* Right: Notification Bell + Filter Icon */}
                    <div className="w-24 flex justify-end items-center gap-2">
                        <div className="border border-slate-300 rounded-sm bg-gray-100 shadow-sm flex items-center justify-center">
                            <NotificationBell />
                        </div>
                        {/* //<CataShowWrapper permission={Cata_Permissions.ViewFilterbutton}> */}
                        <div className="relative" ref={filterRef}>
                            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                                <IconFilter />
                            </button>

                            {isFilterOpen && (
                                <div className="absolute top-full right-0 mt-3 w-64 bg-white rounded-sm shadow-lg z-[1000] border p-3">
                                    <ul className="py-1 border-b mb-2">
                                        {dateFilters.map((filter) => (
                                            <li key={filter.value}>
                                                <button onClick={() => handleDateFilterSelect(filter.value)} className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-orange-50 text-orange-600 font-bold' : 'text-slate-700'} hover:bg-slate-50`}>{filter.label}</button>
                                            </li>
                                        ))}
                                    </ul>
                                    {activeDateFilter === 'custom' && (
                                        <div className="space-y-2 mt-2">
                                            <input type="date" className="text-xs p-1.5 border rounded w-full" onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })} />
                                            <input type="date" className="text-xs p-1.5 border rounded w-full" onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })} />
                                            <button onClick={handleApplyCustomDate} className="w-full bg-orange-500 text-white py-1.5 rounded text-xs font-bold mt-2">Apply Filter</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* </CataShowWrapper> */}
                    </div>
                </div>
            </div>

            {/* --- 6. UPDATED STEPPER SECTION --- */}
            <div className={`bg-white shadow-sm sticky z-[50] border-b top-[72px]`}>

                {/* Request Page */}
                <div
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`)}
                    className="mx-3 mt-2 mb-2 rounded-sm cursor-pointer bg-white border border-slate-200 px-3 py-2 flex items-center justify-between shadow-sm hover:bg-slate-50 active:scale-[0.99] transition-all">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Customer Requests
                        </span>
                        <span className="text-xs font-black text-slate-800">
                            View All Requests →
                        </span>
                    </div>


                    <div className="min-w-[26px] h-[22px] px-2 flex items-center justify-center
                    text-[11px] font-black rounded-sm
                    bg-red-500 text-white">
                        {pendingRequestCount}
                    </div>
                </div>

                {/* ORDER TIMELINE */}
                <div className="flex items-center w-full px-2 md:px-10 pt-9 pb-9 bg-white">
                    {OrderStatuses.map((status, index) => {
                        const activeIndex = OrderStatuses.indexOf(activeStatusTab);
                        const isCompleted = index < activeIndex;
                        const isActive = index === activeIndex;
                        const count = statusCounts[status] || 0;

                        return (
                            <React.Fragment key={status}>
                                <div
                                    className="relative flex flex-col items-center flex-1 min-w-0 cursor-pointer"
                                    onClick={() => setActiveStatusTab(status)}
                                >
                                    <span
                                        className={`absolute ${index % 2 === 0 ? 'bottom-full mb-2' : 'top-full mt-2'
                                            } text-center text-[8px] sm:text-[10px] md:text-[11px] uppercase tracking-tighter ${isActive ? 'text-[#F97316] font-black' : 'text-gray-400 font-bold'} whitespace-nowrap`}
                                    >
                                        {status}
                                    </span>
                                    <div
                                        className={`relative w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${status === "Upcoming"
                                            ? "bg-orange-500 text-white"
                                            : isCompleted || isActive
                                                ? "bg-orange-500 text-white"
                                                : "bg-gray-200 text-gray-500"
                                            } ${isActive ? "scale-110 shadow-md ring-2 ring-orange-100" : ""}`}
                                    >

                                        {/* {status === "Upcoming" ? (
                                        //     <span className="absolute px-1 py-[2px] text-[5px] font-black uppercase rounded-full bg-orange-100 text-[#F97316] border border-orange-300 whitespace-nowrap">
                                        //         Coming Soon
                                        //     </span>
                                        // ) : ( */}
                                        <span className="text-[10px] md:text-xs font-black">
                                            {count}
                                        </span>

                                    </div>
                                </div>

                                {index < OrderStatuses.length - 1 && (
                                    <div
                                        className={`flex-auto h-0.5 md:h-1.5 transition-colors duration-500 ${index < activeIndex ? 'bg-[#F97316]' : 'bg-gray-200'
                                            }`}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
            {activeStatusTab === 'Completed' && (
                <div className="sticky top-[248px] z-[90] flex p-1 bg-white mx-4 mt-2 rounded-sm shadow-sm border border-slate-200 max-w-md md:mx-auto w-[92%]">
                    {['unpaid', 'paid'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setPaymentFilter(f as any)}
                            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-sm transition-all ${paymentFilter === f
                                ? 'bg-slate-800 text-white shadow-sm'
                                : 'text-slate-500'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            {/* --- 7. ORDERS LIST --- */}
            <div className="flex-grow overflow-y-hidden bg-slate-100 space-y-2 p-1 md:p-4">
                {dataLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                ) : error ? (
                    <p className="p-8 text-center text-red-500">{error}</p>
                ) : filteredOrders.length > 0 ? (
                    <AnimatePresence>
                        {filteredOrders.map((Order) => {
                            const returnMethods =
                                Order.returnHistory && Order.returnHistory.length > 0
                                    ? Array.from(
                                        new Set(
                                            Order.returnHistory.map(r => r.modeOfReturn)
                                        )) : [];
                            const isExpanded = expandedorderId === Order.id;
                            const isUpcomingStatus = Order.status === 'Upcoming';
                            const itemsSubtotal = (Order.items || []).reduce((sum, item) => {
                                const unitPrice = item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0;
                                return sum + (Number(unitPrice) * Number(item.quantity || 0));
                            }, 0);
                            const orderExpensesTotal = (Order.expenses || []).reduce(
                                (sum, ex) => sum + (parseFloat(String(ex.amount)) || 0), 0
                            );
                            const total = Math.max(0, itemsSubtotal + orderExpensesTotal + Number(Order.totalTax || 0) - Number(Order.manualDiscount || 0));
                            let paid = Number(Order.paidAmount || 0);
                            let due = Math.max(0, total - paid);
                            const isPaid = Order.status === 'Paid';
                            const isFinalStage = Order.status === 'Completed' || Order.status === 'Paid';

                            // --- FIX: Ghost Due Amount on Returned Orders ---
                            // If the order is fully Paid, force due to 0 and paid to total. 
                            // This patches DB inconsistencies caused by return logic missing expenses.
                            if (isPaid) {
                                due = 0;
                                paid = total;
                            }
                            // ------------------------------------------------
                            return (
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
                                                    setEditingOrder(Order);
                                                    setSelectedItemForEdit(null);
                                                    // Restore saved expenses
                                                    setEditExpenses(
                                                        Array.isArray((Order as any).expenses) && (Order as any).expenses.length > 0
                                                            ? (Order as any).expenses.map((ex: any) => ({ ...ex, id: ex.id || Date.now() }))
                                                            : []
                                                    );
                                                    // Restore saved discount
                                                    const savedDiscount = Number((Order as any).manualDiscount || 0);
                                                    setEditDiscount(savedDiscount);
                                                    // Restore saved transport details
                                                    const savedTransport = (Order as any).transportDetails || {};
                                                    setTransportName(savedTransport.transportName || '');
                                                    setGrRrNo(savedTransport.grRrNo || '');
                                                    setGrRrDate(savedTransport.grRrDate || '');
                                                    setVehicleNo(savedTransport.vehicleNo || '');
                                                    setStationFrom(savedTransport.stationFrom || '');
                                                    setPinCode(savedTransport.pinCode || '');
                                                    const itemsBase = (Order.items || []).reduce((sum, item) => {
                                                        const salesPrice = Number(item.salesPrice || 0);
                                                        const mrp = Number(item.mrp || 0);
                                                        const price = item.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                                                        return sum + price * Number(item.quantity || 0);
                                                    }, 0);
                                                    setEditDiscountPercent(itemsBase > 0 ? parseFloat(((savedDiscount / itemsBase) * 100).toFixed(2)) : 0);
                                                    setShowBillDiscountFields(savedDiscount > 0);
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
                                                            <p className="text-[10px] text-gray-500">{Order.billingDetails?.phone}</p>
                                                        </div>
                                                        <div className="space-y-1 border-l pl-4">
                                                            <p className="text-[8px] font-black text-blue-500 uppercase">Shipping Address</p>
                                                            <p className="text-[11px] font-bold text-slate-800">{Order.shippingDetails?.name || Order.billingDetails?.name}</p>
                                                            <p className="text-[10px] text-gray-500 leading-tight">{Order.shippingDetails?.address || Order.billingDetails?.address}</p>
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
                                                        // const returnedQty = getReturnedQuantityForItem(item, Order);

                                                        // Collect per-return-event entries for this item
                                                        const returnedEntries: { qty: number; modeOfReturn: string; returnedAt: any }[] = [];
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
                                                                    });
                                                                }
                                                            });
                                                        });
                                                        const totalReturnedFromHistory = returnedEntries.reduce((sum, e) => sum + e.qty, 0);
                                                        // item.quantity may already reflect post-return qty, so add back returned qty to get original
                                                        const originalQty = Number(item.quantity || 0) + totalReturnedFromHistory;
                                                        const remainingQty = originalQty - totalReturnedFromHistory; // = item.quantity
                                                        // Extract the pure base price for display so the visual math aligns with the Tax row below it
                                                        const unitPrice = item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0;

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
                                                                                ₹{formatAmount(unitPrice)} per {item.unit || "pcs"}
                                                                            </p>
                                                                        </div>
                                                                        <div className="text-right ml-4">
                                                                            <p className="text-[13px] font-black text-slate-900">
                                                                                ₹{formatAmount(unitPrice * remainingQty)}
                                                                            </p>
                                                                            <p className="text-[9px] font-bold text-slate-500 bg-white">
                                                                                Qty: {remainingQty}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* RETURNED ENTRIES — one crossed-out row per return event */}
                                                                {returnedEntries.map((entry, rIdx) => (
                                                                    entry.qty > 0 && (
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
                                                                                    ₹{formatAmount(unitPrice * entry.qty)}
                                                                                </p>
                                                                                <p className="text-[9px] font-bold text-slate-400">
                                                                                    Qty: {entry.qty}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                ))}
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
                                                            {Number(Order.totalTax || 0) > 0 && (
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
                                                            ? Order.userLoginPhone ? 'grid-cols-3' : 'grid-cols-1'
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
                                                                    className="py-2.5 bg-white border border-emerald-200 text-emerald-600 text-xs font-bold rounded-sm text-center"
                                                                >
                                                                    Call
                                                                </a>

                                                                <a
                                                                    href={`https://wa.me/${Order.userLoginPhone.replace(/\D/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="py-2.5 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center"
                                                                >
                                                                    WhatsApp
                                                                </a>

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
                        })}
                    </AnimatePresence>
                ) : (
                    <p className="p-8 text-center text-slate-500">No Orders found.</p>
                )}
            </div>

            {/* Modals (SelectedAction, QR, Payment, Editing) Same as provided */}
            {selectedOrderForAction && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => { setSelectedOrderForAction(null); setShowPrintSubMenu(false); }}>
                    <div className="bg-white rounded-sm p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex mb-4 bg-slate-100 rounded-sm p-1">
                            {['bill', 'estimate'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setBillType(type as any)}
                                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-sm transition-all ${billType === type
                                        ? 'bg-white text-[#F97316] shadow-sm'
                                        : 'text-slate-500'
                                        }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleSendWhatsapp(selectedOrderForAction)}
                                disabled={sendingPdf || pdfLoadingOrderId === selectedOrderForAction.id}
                                className="w-full bg-[#25D366] text-white py-2.5 rounded-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {sendingPdf ? (
                                    <Spinner />
                                ) : (
                                    <>
                                        <FiSend /> Share on WhatsApp
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    const order = selectedOrderForAction;

                                    setPdfLoadingOrderId(order.id);   // spinner start

                                    setSelectedOrderForAction(null);

                                    setTimeout(() => {
                                        handlePdfAction(order, ACTION.DOWNLOAD);
                                    }, 50);
                                }}
                                className="w-full bg-blue-600 text-white py-2.5 rounded-sm font-bold flex items-center justify-center"
                            >
                                Download PDF
                            </button>
                            <button
                                onClick={() => {
                                    setShowPrintSubMenu(true);
                                }}
                                className="w-full border py-2.5 rounded-sm font-bold"
                            >
                                Print
                            </button>
                            <button
                                disabled
                                onClick={() => {
                                    setShowQrModal(selectedOrderForAction);
                                    setSelectedOrderForAction(null);
                                }}
                                className="w-full bg-gray-400 cursor-not-allowed text-white py-2.5 rounded-sm font-bold"
                            >
                                Generate QR Code
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showPrintSubMenu && selectedOrderForAction && (
                <div
                    className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setShowPrintSubMenu(false)}
                >
                    <div
                        className="bg-white rounded-sm p-6 w-full max-w-xs shadow-xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 text-center">
                            Print Options
                        </h3>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    const order = selectedOrderForAction;
                                    setPdfLoadingOrderId(order.id);
                                    setSelectedOrderForAction(null);
                                    setShowPrintSubMenu(false);
                                    setTimeout(() => {
                                        handlePdfAction(order, ACTION.PRINT);
                                    }, 50);
                                }}
                                className="w-full border py-2.5 rounded-sm font-bold text-sm"
                            >
                                Print (Bill Only)
                            </button>
                            <button
                                onClick={() => {
                                    const order = selectedOrderForAction;
                                    setPdfLoadingOrderId(order.id);
                                    setSelectedOrderForAction(null);
                                    setShowPrintSubMenu(false);
                                    setTimeout(() => {
                                        handlePdfAction(order, ACTION.PRINT, true);
                                    }, 50);
                                }}
                                className="w-full border border-orange-400 text-orange-600 py-2.5 rounded-sm font-bold text-sm"
                            >
                                Print (Bill + Duplicate)
                            </button>
                            <button
                                onClick={() => setShowPrintSubMenu(false)}
                                className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-700 mt-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showQrModal && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
                        <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <FiX size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">Download Bill</h3>
                        <p className="text-sm text-gray-500 mb-4">Invoice #{showQrModal.orderId}</p>
                        <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
                            <QRCode
                                value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${showQrModal.id}`}
                                size={200}
                                viewBox={`0 0 256 256`}
                            />
                        </div>
                        <p className="text-center text-sm text-gray-600 mb-4">Scan to download PDF</p>
                        <button
                            onClick={() => setShowQrModal(null)}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {showPaymentModal && (() => {
                // FIX 3: Include Expenses and Discounts in the Payment Drawer Total
                const itemsTotal = (showPaymentModal.items || []).reduce(
                    (sum, item) =>
                        sum + (
                            (item.finalPrice ??
                                (Number(item.salesPrice || 0) > 0
                                    ? Number(item.salesPrice)
                                    : Number(item.mrp || 0)))
                            * Number(item.quantity || 0)
                        ),
                    0
                );

                const expTotal = (showPaymentModal.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0);
                const discTotal = Number(showPaymentModal.manualDiscount || 0);

                // FIX: Round the total to 2 decimal places
                const updatedTotal = Number(Math.max(0, itemsTotal + expTotal - discTotal).toFixed(2));

                // Current paid
                const alreadyPaid = Number(showPaymentModal.paidAmount || 0);

                // FIX: Round the final due amount to prevent long decimals
                const currentDue = Number(Math.max(0, updatedTotal - alreadyPaid).toFixed(2));
                return (
                    <PaymentModal
                        isOpen={!!showPaymentModal}
                        onClose={() => setShowPaymentModal(null)}
                        availableCredit={customerCredit} // <--- PASS CREDIT TO MODAL
                        invoice={{
                            id: showPaymentModal.id,
                            invoiceNumber: showPaymentModal.orderId,
                            amount: currentDue,
                            partyName: showPaymentModal.userName,
                            dueAmount: currentDue,
                            time: showPaymentModal.time,
                            status: currentDue === 0 ? 'Paid' : 'Unpaid',
                            type: 'Credit',
                            createdAt: new Date(),
                        }}
                        onSubmit={async (_inv, amount, method) => {
                            try {
                                if (!currentUser?.companyId || !showPaymentModal) return;

                                const orderRef = doc(
                                    db,
                                    'companies',
                                    currentUser.companyId,
                                    'Orders',
                                    showPaymentModal.id
                                );

                                const methodKey = method ? method.toUpperCase() : 'CASH';

                                // --- NEW: DEDUCT FROM CUSTOMER DB IF CREDIT NOTE USED ---
                                if (methodKey === 'CREDIT NOTE' || methodKey === 'CREDIT') {
                                    const phone = showPaymentModal.userLoginPhone || showPaymentModal.billingDetails?.phone || '';
                                    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

                                    if (normalizedPhone) {
                                        const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', normalizedPhone);
                                        await updateDoc(customerRef, {
                                            creditBalance: firebaseIncrement(-amount) // Deduct the used amount
                                        });
                                    }
                                }
                                // --------------------------------------------------------

                                const currentMethods = showPaymentModal.paymentMethods || {};

                                const newPaidTotal = alreadyPaid + amount;
                                const remainingDue = Math.max(0, updatedTotal - newPaidTotal);

                                const updatedMethods = {
                                    ...currentMethods,
                                    [methodKey]: (currentMethods[methodKey] || 0) + amount,
                                    due: remainingDue // Sync the exact database due amount!
                                };

                                let newStatus = showPaymentModal.status;

                                // FIXED: Only alter the status automatically if it's already in the final stages.
                                // Otherwise, keep it in its current tab (Upcoming, Confirmed, Packed).
                                if (newStatus === 'Completed' || newStatus === 'Paid') {
                                    if (remainingDue <= 0.1) {
                                        newStatus = 'Paid';
                                    } else {
                                        newStatus = 'Completed';
                                    }
                                }

                                await updateDoc(orderRef, {
                                    paidAmount: newPaidTotal,
                                    paymentMethods: updatedMethods,
                                    paymentMethod: methodKey,
                                    status: newStatus,
                                    updatedAt: serverTimestamp(),
                                });

                                window.dispatchEvent(
                                    new CustomEvent('pdc_notification', {
                                        detail: {
                                            type: 'PAYMENT_RECEIVED',
                                            invoiceNumber: showPaymentModal.orderId,
                                            partyName: showPaymentModal.userName || showPaymentModal.billingDetails?.name || 'Customer',
                                            amount: Number(amount || 0),
                                            method: methodKey,
                                            status: newStatus === 'Paid' ? 'PAID' : 'UPCOMING',
                                            createdAt: new Date().toISOString(),
                                        },
                                    })
                                );

                                setShowPaymentModal(null);
                                setModal({
                                    message: "Payment successful!",
                                    type: State.SUCCESS,
                                });

                            } catch (err) {
                                console.error("Payment Error:", err);
                                setModal({
                                    message: "Payment failed",
                                    type: State.ERROR,
                                });
                            }
                        }}
                    />
                );
            })()}

            {showTransportModal && (
                <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4" onClick={() => setShowTransportModal(false)}>
                    <div className="absolute inset-0 bg-black/50" />
                    <div className="relative w-full max-w-md bg-white rounded-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-orange-500 px-4 py-2.5 flex items-center justify-between">
                            <h3 className="text-white font-semibold text-sm">Transport Details</h3>
                            <button onClick={() => setShowTransportModal(false)} className="text-white hover:text-orange-100">
                                <FiX size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Transport Name</label>
                                    <input type="text" value={transportName} onChange={(e) => setTransportName(e.target.value)} placeholder="e.g. DP World Express Logistic" className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">GR/RR No.</label>
                                    <input type="text" value={grRrNo} onChange={(e) => setGrRrNo(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">GR/RR Date</label>
                                    <input type="date" value={grRrDate} onChange={(e) => setGrRrDate(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Vehicle No.</label>
                                    <input type="text" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">PIN Code</label>
                                    <input type="text" maxLength={6} value={pinCode} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Station / From Place</label>
                                    <input type="text" value={stationFrom} onChange={(e) => setStationFrom(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                {hasTransportDetails && (
                                    <button
                                        onClick={() => { setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode(''); }}
                                        className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-sm transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowTransportModal(false)}
                                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-sm font-bold text-sm transition-colors"
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {editingOrder && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-1 md:p-3">
                    <div className="bg-white rounded-sm w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="px-5 py-3 border-b flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800 leading-tight">Edit Order</h3>
                                    <p className="text-[10px] text-orange-600 font-bold uppercase tracking-tighter">{editingOrder.orderId}</p>
                                </div>

                                {/* Divider aur Total Amount */}
                                <div className="h-8 w-[1px] bg-gray-500 mx-2"></div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Amount</span>
                                    <span className="text-md font-black text-slate-900 leading-none">₹{formatAmount(calculatedEditTotal)}  </span>
                                </div>
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setEditingOrder(null)}
                                className="p-1.5 hover:bg-gray-200 rounded-sm transition-colors"
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                                {/* LEFT SIDE: ADDRESSES */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex sm:hidden p-1 bg-slate-100 rounded-sm mb-2 flex-1">
                                            <button
                                                onClick={() => setActiveTab('billing')}
                                                className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${activeTab === 'billing' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Billing
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('shipping')}
                                                className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${activeTab === 'shipping' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Shipping
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Billing Address Section */}
                                        <div className={`p-4 rounded-sm border border-slate-200 bg-orange-50/30 space-y-3 ${activeTab === 'billing' ? 'block' : 'hidden sm:block'}`}>
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-[11px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 bg-orange-600 rounded-sm"></span> Billing Address
                                                </h4>

                                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        id="sameAsBilling"
                                                        className="w-3.5 h-3.5 accent-orange-600 rounded-sm cursor-pointer"
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setEditingOrder({
                                                                    ...editingOrder,
                                                                    shippingDetails: { ...editingOrder.billingDetails }
                                                                });
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Same for Shipping</span>
                                                </label>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                {/* NAME FIELD */}
                                                <input
                                                    type="text"
                                                    placeholder="Name"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.name || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, name: val },
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, name: val } })
                                                        });
                                                    }}
                                                />

                                                {/* PHONE FIELD (Billing) - Security Check Added */}
                                                <input
                                                    type="text"
                                                    placeholder="Phone"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.phone || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;

                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, phone: val },
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, phone: val } })
                                                        });
                                                    }}
                                                />

                                                {/* ADDRESS FIELD */}
                                                <textarea
                                                    placeholder="Address"
                                                    className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.address || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, address: val },
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, address: val } })
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Shipping Address Section */}
                                        <div className={`p-4 rounded-sm border border-slate-200 bg-blue-50/30 space-y-3 ${activeTab === 'shipping' ? 'block' : 'hidden sm:block'}`}>
                                            <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-blue-600 rounded-sm"></span> Shipping Address
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Name"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400"
                                                    value={editingOrder.shippingDetails?.name || ''}
                                                    onChange={(e) => setEditingOrder({
                                                        ...editingOrder,
                                                        shippingDetails: { ...editingOrder.shippingDetails!, name: e.target.value }
                                                    })}
                                                />

                                                <input
                                                    type="text"
                                                    placeholder="Phone"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400"
                                                    value={editingOrder.shippingDetails?.phone || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            shippingDetails: { ...editingOrder.shippingDetails!, phone: val }
                                                        });
                                                    }}
                                                />

                                                <textarea
                                                    placeholder="Address"
                                                    className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-blue-400"
                                                    value={editingOrder.shippingDetails?.address || ''}
                                                    onChange={(e) => setEditingOrder({
                                                        ...editingOrder,
                                                        shippingDetails: { ...editingOrder.shippingDetails!, address: e.target.value }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT SIDE: ITEMS & TOTAL */}
                                <div className="flex flex-col w-full space-y-2">
                                    {/* ADD NEW ITEM SEARCH BOX */}
                                    <div className="p-2 border-t border-slate-200">
                                        <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest mb-2">Add New Item</p>
                                        <SearchableItemInput
                                            items={availableItems}
                                            onItemSelected={(selectedItem) => {
                                                if (!selectedItem.id) return;
                                                const newMrp = Number(selectedItem.mrp || 0);
                                                const newSalesPrice = Number(selectedItem.salesPrice || 0);
                                                let finalPrice = newSalesPrice > 0 ? newSalesPrice : newMrp;
                                                const qty = selectedItem.moq && selectedItem.moq > 0 ? selectedItem.moq : 1;
                                                const newItem: any = {
                                                    ...selectedItem,
                                                    id: crypto.randomUUID(),
                                                    itemId: selectedItem.id,
                                                    productId: selectedItem.id,
                                                    name: selectedItem.name,
                                                    quantity: qty,
                                                    mrp: newMrp,
                                                    salesPrice: newSalesPrice,
                                                    unitMultiplier: selectedItem.unitMultiplier ?? 1,
                                                    note: "",
                                                    itemGroupId: selectedItem.itemGroupId,
                                                    moq: selectedItem.moq ?? 0,
                                                    tax: Number(selectedItem.tax),
                                                    imageUrl: selectedItem.imageUrl || "",
                                                    imageBase64: "",
                                                    unitPrice: finalPrice,
                                                    finalPrice: finalPrice,
                                                };

                                                const updatedItems = [newItem, ...(editingOrder.items || [])];
                                                const newTotal = updatedItems.reduce((sum, i) => sum + ((i.finalPrice ?? (Number(i.salesPrice || 0) > 0 ? Number(i.salesPrice) : Number(i.mrp))) * Number(i.quantity || 0)), 0);
                                                setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: newTotal });
                                            }}
                                            placeholder="Search item to add..."
                                        />
                                    </div>

                                    <div className="h-fit self-start w-full flex flex-col">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mt-2">
                                            Items ({editingOrder.items?.length})
                                        </h4>

                                        {/* Items List Container */}
                                        <div className="h-auto">
                                            <GenericCartList
                                                items={mappedOrderItems}
                                                availableItems={availableItems}
                                                basePriceKey="mrp"
                                                priceLabel="MRP"
                                                settings={{
                                                    enableRounding: false,
                                                    roundingInterval: 1,
                                                    enableItemWiseDiscount: enableItemWiseDiscount,
                                                    lockDiscount: false,
                                                    lockPrice: false,
                                                    hideMrp: false,
                                                }}
                                                applyRounding={(amount) => amount}
                                                State={State}
                                                setModal={setModal}
                                                onOpenEditDrawer={(item) => {
                                                    setSelectedItemForEdit(item);
                                                    setIsEditDrawerOpen(true);
                                                }}
                                                onDeleteItem={handleDeleteItem}
                                                onDiscountChange={handleDiscountChange}
                                                onDiscount2Change={handleDiscount2Change}
                                                onCustomPriceChange={handleNetPriceChange}
                                                onCustomPriceBlur={() => { }}
                                                onQuantityChange={handleQuantityChange}
                                            />
                                        </div>

                                        {/* --- ITEM EDIT DRAWER COMPONENT --- */}
                                        {isEditDrawerOpen && selectedItemForEdit && (
                                            <ItemEditDrawer
                                                item={selectedItemForEdit}
                                                isOpen={isEditDrawerOpen}
                                                onClose={() => setIsEditDrawerOpen(false)}
                                                onSaveSuccess={handleSaveSuccess}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Expenses & Discount Section */}
                        <div className="px-4 py-2 bg-white border-t space-y-3">
                            {/* Combined action row */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setEditExpenses(prev => [...prev, { id: Date.now(), name: '', amount: '' }])}
                                    className="flex-1 text-[10px] font-bold text-orange-500 border border-orange-300 px-2 py-1.5 rounded-sm hover:bg-orange-50"
                                >
                                    + Add Expense
                                </button>
                                <button
                                    onClick={() => setShowBillDiscountFields(prev => !prev)}
                                    className="flex-1 text-[10px] font-bold text-red-500 border border-red-300 px-2 py-1.5 rounded-sm hover:bg-red-50"
                                >
                                    + Bill Discount
                                </button>
                                {enableTransportDetails && (
                                    <button
                                        onClick={() => setShowTransportModal(true)}
                                        className={`flex-1 text-[10px] font-bold border px-2 py-1.5 rounded-sm transition-colors ${hasTransportDetails ? 'text-teal-700 border-teal-400 bg-teal-50' : 'text-teal-600 border-teal-300 hover:bg-teal-50'}`}
                                    >
                                        {hasTransportDetails ? '✓ Transport' : '+ Transport'}
                                    </button>
                                )}
                            </div>

                            {editExpenses.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {editExpenses.map((expense) => (
                                        <div key={expense.id} className="flex items-center gap-2 p-2 bg-orange-50 rounded-sm border border-orange-100">
                                            <input
                                                type="text"
                                                placeholder="Expense name (e.g. Freight)"
                                                value={expense.name}
                                                onChange={(e) => setEditExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, name: e.target.value } : ex))}
                                                className="flex-1 p-2 text-xs rounded-sm border border-orange-200 bg-white outline-none focus:border-orange-400"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Amount (₹)"
                                                value={expense.amount}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value) || '';
                                                    setEditExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, amount: val } : ex));
                                                }}
                                                className="w-24 p-2 text-xs rounded-sm border border-orange-200 bg-white outline-none focus:border-orange-400"
                                            />
                                            <button
                                                onClick={() => setEditExpenses(prev => prev.filter(ex => ex.id !== expense.id))}
                                                className="p-1 rounded-full bg-orange-100 hover:bg-red-100 text-orange-400 hover:text-red-500"
                                            >
                                                <FiX size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {showBillDiscountFields && (
                                <div className="flex items-center justify-between gap-3 p-2 bg-red-50 rounded-sm border border-red-100">
                                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest whitespace-nowrap">Bill Discount</p>
                                    <div className="flex items-center gap-1">
                                        <div className="relative flex items-center">
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={editDiscountPercent || ''}
                                                onChange={(e) => {
                                                    let pct = parseFloat(e.target.value) || 0;
                                                    if (pct > 100) pct = 100;
                                                    if (pct < 0) pct = 0;
                                                    setEditDiscountPercent(pct);
                                                    // base = items only (no expenses, no existing discount)
                                                    const base = (editingOrder?.items || []).reduce((sum, item) => {
                                                        const salesPrice = Number(item.salesPrice || 0);
                                                        const mrp = Number(item.mrp || 0);
                                                        const price = item.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                                                        return sum + price * Number(item.quantity || 0);
                                                    }, 0);
                                                    setEditDiscount(parseFloat(((pct / 100) * base).toFixed(2)));
                                                }}
                                                className="w-16 text-center bg-white border border-red-200 rounded-sm text-red-700 text-xs p-1.5 outline-none focus:border-red-400 pr-4"
                                            />
                                            <span className="absolute right-1 text-[10px] text-red-400 font-bold pointer-events-none">%</span>
                                        </div>
                                        <span className="text-gray-300 text-xs">|</span>
                                        <div className="relative flex items-center">
                                            <span className="absolute left-1 text-[10px] text-red-400 font-bold pointer-events-none">₹</span>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={editDiscount || ''}
                                                onChange={(e) => {
                                                    const amt = parseFloat(e.target.value) || 0;
                                                    setEditDiscount(amt);
                                                    const base = (editingOrder?.items || []).reduce((sum, item) => {
                                                        const salesPrice = Number(item.salesPrice || 0);
                                                        const mrp = Number(item.mrp || 0);
                                                        const price = item.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                                                        return sum + price * Number(item.quantity || 0);
                                                    }, 0);
                                                    setEditDiscountPercent(base > 0 ? parseFloat(((amt / base) * 100).toFixed(2)) : 0);
                                                }}
                                                className="w-20 text-center bg-white border border-red-200 rounded-sm text-red-700 text-xs p-1.5 outline-none focus:border-red-400 pl-4"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Live total preview */}
                            <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Total</span>
                                <span className="text-base font-black text-slate-800">₹{formatAmount(calculatedEditTotal)}</span>
                            </div>
                        </div>
                        {/* Footer Buttons */}
                        <div className="px-6 py-4 bg-slate-50 border-t flex gap-3">
                            <button
                                onClick={() => {
                                    setEditingOrder(null);
                                    setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode('');
                                }}
                                className="flex-1 py-2.5 bg-gray-400 text-black text-sm font-bold hover:bg-slate-300 rounded-sm transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={handleSaveChanges}
                                className="flex-[2] bg-orange-600 text-white py-2.5 rounded-sm text-sm font-black shadow-sm hover:bg-orange-700 transition-colors uppercase"
                            >
                                SAVE CHANGES
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {selectedOrderForConfirm && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-[340px] rounded-sm shadow-xl border border-slate-200 p-5">
                        <p className="text-center text-sm font-semibold text-slate-700 mb-1">
                            Move order to <span className="text-orange-600">Completed</span>?
                        </p>
                        <p className="text-center text-[11px] text-slate-400 mb-5">
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-2.5 bg-slate-200 text-slate-800 text-xs font-black rounded-sm hover:bg-slate-300 transition"
                                onClick={() => setSelectedOrderForConfirm(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="flex-1 py-2.5 bg-orange-600 text-white text-xs font-black rounded-sm hover:bg-orange-700 transition"
                                onClick={() => {
                                    const orderId = selectedOrderForConfirm;
                                    setSelectedOrderForConfirm(null);
                                    handleUpdateStatus(orderId, 'Packed', 'Completed');
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Delete Confirm Modal */}
            {showDeleteConfirmModal && pendingDeleteOrderId && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-[360px] rounded-sm shadow-xl border border-slate-200 p-5">
                        <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                            Delete Order
                        </p>
                        <p className="text-center text-sm text-slate-600 mb-5 leading-snug">
                            {pendingDeleteWarning || (
                                <>Are you sure you want to <span className="text-red-600 font-bold">delete this order</span>? This action cannot be undone.</>
                            )}
                        </p>
                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-2.5 bg-slate-200 text-slate-800 text-xs font-black rounded-sm hover:bg-slate-300 transition"
                                onClick={() => {
                                    setShowDeleteConfirmModal(false);
                                    setPendingDeleteOrderId(null);
                                    setPendingDeleteWarning(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="flex-1 py-2.5 bg-red-600 text-white text-xs font-black rounded-sm hover:bg-red-700 transition"
                                onClick={async () => {
                                    const orderId = pendingDeleteOrderId;
                                    setShowDeleteConfirmModal(false);
                                    setPendingDeleteOrderId(null);
                                    setPendingDeleteWarning(null);
                                    await handleDeleteOrder(orderId, true);
                                }}
                            >
                                Delete Order
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Zero Amount Modal */}
            {showZeroAmountModal && pendingZeroOrderId && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-[360px] rounded-sm shadow-xl border border-slate-200 p-5">
                        <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                            Order Amount is ₹0
                        </p>
                        <p className="text-center text-sm text-slate-600 mb-5 leading-snug">
                            All items have been removed. Do you want to <span className="text-red-600 font-bold">delete this order</span> entirely?
                        </p>
                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-2.5 bg-slate-200 text-slate-800 text-xs font-black rounded-sm hover:bg-slate-300 transition"
                                onClick={() => {
                                    setShowZeroAmountModal(false);
                                    setPendingZeroOrderId(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="flex-1 py-2.5 bg-red-600 text-white text-xs font-black rounded-sm hover:bg-red-700 transition"
                                onClick={async () => {
                                    const orderId = pendingZeroOrderId;
                                    setShowZeroAmountModal(false);
                                    setPendingZeroOrderId(null);
                                    setEditingOrder(null);
                                    await handleDeleteOrder(orderId, true);
                                }}
                            >
                                Delete Order
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Adjustment Popup */}
            {showAdjustmentPopup && pendingAdjustment && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-[360px] rounded-sm shadow-xl border border-slate-200 p-5">

                        <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-500">
                            Amount Reduced
                        </p>

                        <p className="text-center text-xl font-black text-orange-600 mt-2 mb-5">
                            ₹{pendingAdjustment.amount.toFixed(2)}
                        </p>

                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-2.5 bg-orange-600 text-white text-xs font-black rounded-sm hover:bg-orange-700 transition"
                                onClick={handleCreditNote}
                            >
                                Credit Note
                            </button>

                            <button
                                className="flex-1 py-2.5 bg-green-600 text-white text-xs font-black rounded-sm hover:bg-green-700 transition"
                                onClick={handleRefund}
                            >
                                Refund
                            </button>
                        </div>

                        <button
                            className="mt-4 w-full text-[10px] font-bold text-slate-400 hover:text-slate-700"
                            onClick={() => {
                                setShowAdjustmentPopup(false);
                                setPendingAdjustment(null);
                            }}
                        >
                            Cancel
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdersPage;